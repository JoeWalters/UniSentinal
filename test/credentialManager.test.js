'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// CredentialManager writes $CONFIG_DIR/.key in its constructor, so CONFIG_DIR
// must be a temp dir before the first `new CredentialManager()`.
const CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'us59-'));
process.env.CONFIG_DIR = CONFIG_DIR;

const CredentialManager = require('../src/utils/CredentialManager');
const { SENSITIVE_FIELDS } = CredentialManager;

const EXPECTED = [
    'UNIFI_PASSWORD',
    'DATABASE_PASSWORD',
    'API_KEY',
    'SECRET_KEY',
    'PUSHOVER_TOKEN',
    'PUSHOVER_USER',
    'NTFY_TOKEN',
    'NTFY_PASSWORD',
    'UI_PASSWORD',
];

const ALL_FIVE = {
    PUSHOVER_TOKEN: 'po-token-abc',
    PUSHOVER_USER: 'po-user-xyz',
    NTFY_TOKEN: 'ntfy-tok-777',
    NTFY_PASSWORD: 'ntfy-pass-999',
    UI_PASSWORD: 'ui-pass-123',
};

test('SENSITIVE_FIELDS is exported, frozen, and covers every accepted credential (AC1/AC2)', () => {
    assert.ok(Object.isFrozen(SENSITIVE_FIELDS));
    assert.deepEqual([...SENSITIVE_FIELDS].sort(), [...EXPECTED].sort());
    for (const field of EXPECTED) {
        assert.ok(SENSITIVE_FIELDS.includes(field), `missing ${field}`);
    }
});

test('every SENSITIVE_FIELDS member is encrypted, decrypted, and redacted', () => {
    const manager = new CredentialManager();
    const body = {};
    for (const field of SENSITIVE_FIELDS) {
        body[field] = 'plain-' + field;
    }
    const encrypted = manager.encryptSettings(body);
    for (const field of SENSITIVE_FIELDS) {
        assert.ok(encrypted[field].startsWith('encrypted:'), `${field} should be encrypted`);
    }
    const decrypted = manager.decryptSettings(encrypted);
    for (const field of SENSITIVE_FIELDS) {
        assert.equal(decrypted[field], 'plain-' + field);
    }
    const sanitized = manager.sanitizeForLogging(body);
    for (const field of SENSITIVE_FIELDS) {
        assert.equal(sanitized[field], '[REDACTED]');
    }
});

test('round trip: decryptSettings(encryptSettings(settings)) returns the original plaintexts', () => {
    const manager = new CredentialManager();
    const input = { ...ALL_FIVE, UNIFI_PASSWORD: 'unifi-secret', API_KEY: 'api-1' };
    const roundTripped = manager.decryptSettings(manager.encryptSettings(input));
    assert.deepEqual(roundTripped, input);
});

test('legacy cleartext PUSHOVER_TOKEN passes through decryptSettings unchanged', () => {
    const manager = new CredentialManager();
    const legacy = { PUSHOVER_TOKEN: 'legacy-clear' };
    const out = manager.decryptSettings(legacy);
    assert.equal(out.PUSHOVER_TOKEN, 'legacy-clear');
});

test('sanitizeForLogging output leaks no plaintext value for the five fields (AC4/AC5)', () => {
    const manager = new CredentialManager();
    const sanitized = manager.sanitizeForLogging(ALL_FIVE);
    const json = JSON.stringify(sanitized);
    for (const value of Object.values(ALL_FIVE)) {
        assert.ok(!json.includes(value), `sanitized log must not contain plaintext ${value}`);
    }
    assert.ok(!json.includes('po-token-abc'));
    assert.ok(!json.includes('ui-pass-123'));
});

test('UI_PASSWORD is redacted from sanitized logging', () => {
    const manager = new CredentialManager();
    const sanitized = manager.sanitizeForLogging({ UI_PASSWORD: 'ui-pass-123' });
    assert.equal(sanitized.UI_PASSWORD, '[REDACTED]');
    assert.ok(!JSON.stringify(sanitized).includes('ui-pass-123'));
});

// ── Card #46: authenticated encryption and key-file permissions ──────────────

const crypto = require('crypto');

function managerInTempDir(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `us46-${name}-`));
    process.env.CONFIG_DIR = dir;
    const manager = new CredentialManager();
    return { dir, manager };
}

test('a value round-trips through authenticated encryption and is marked v2', () => {
    const { dir, manager } = managerInTempDir('roundtrip');
    const stored = manager.encrypt('hunter2');

    assert.match(stored, /^encrypted:v2:/, 'new values use the authenticated format');
    assert.equal(manager.decrypt(stored), 'hunter2');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('flipping one byte of a stored value fails the authentication check', () => {
    const { dir, manager } = managerInTempDir('tamper');
    // On a normal start the key file already exists; only a *fresh* key makes the
    // reason "key was missing", which the next test covers.
    manager.keyWasGenerated = false;
    const stored = manager.encrypt('hunter2');

    const prefix = 'encrypted:v2:';
    const bytes = Buffer.from(stored.slice(prefix.length), 'base64');
    bytes[bytes.length - 1] ^= 0x01; // flip one bit of the ciphertext
    const tampered = prefix + bytes.toString('base64');

    const result = manager.decryptDetailed(tampered);
    assert.equal(result.value, null, 'a tampered value must not decrypt');
    assert.match(result.error, /authentication check/, 'and the reason names tampering, not a generic failure');
    assert.equal(manager.decrypt(tampered), null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('a value written with the old CBC format still decrypts', () => {
    const { dir, manager } = managerInTempDir('legacy');

    // Reproduce exactly what the pre-GCM code wrote: encrypted: + base64(iv||ct).
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', manager.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update('old-secret', 'utf8'), cipher.final()]);
    const legacy = 'encrypted:' + Buffer.concat([iv, ciphertext]).toString('base64');

    assert.equal(manager.decrypt(legacy), 'old-secret', 'existing installs keep working');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('a completely foreign key cannot decrypt, and the reason is stated', () => {
    const { dir, manager } = managerInTempDir('foreignkey');
    const stored = manager.encrypt('hunter2');

    // A second manager in a different directory has a different master key.
    const other = managerInTempDir('foreignkey-other');
    other.manager.keyWasGenerated = false;
    const result = other.manager.decryptDetailed(stored);
    assert.equal(result.value, null, 'another key must not yield plaintext');
    assert.match(result.error, /authentication check/);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(other.dir, { recursive: true, force: true });
});

test('a missing/regenerated key and a tampered value are reported differently', () => {
    const { dir, manager } = managerInTempDir('reasons');
    const stored = manager.encrypt('hunter2');

    // (a) the stored value was edited, key unchanged
    const prefix = 'encrypted:v2:';
    const bytes = Buffer.from(stored.slice(prefix.length), 'base64');
    bytes[bytes.length - 1] ^= 0x01;
    manager.keyWasGenerated = false;
    const tampered = manager.decryptDetailed(prefix + bytes.toString('base64'));

    // (b) the value is fine but this start had to generate a new key
    const other = managerInTempDir('reasons-other');
    other.manager.keyWasGenerated = true; // as when .key is missing at boot
    const withFreshKey = other.manager.decryptDetailed(stored);

    assert.equal(tampered.value, null);
    assert.equal(withFreshKey.value, null);
    assert.match(tampered.error, /authentication check/);
    assert.match(withFreshKey.error, /master key was missing or regenerated/);
    assert.notEqual(tampered.error, withFreshKey.error, 'the two causes must not read the same');

    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(other.dir, { recursive: true, force: true });
});

test('a key file created here is 0600', () => {
    const { dir, manager } = managerInTempDir('mode600');
    const mode = fs.statSync(manager.keyFile).mode & 0o777;
    assert.equal(mode.toString(8), '600');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('an existing key file with wide permissions is reported at startup', () => {
    const { dir, manager } = managerInTempDir('widemode');
    fs.chmodSync(manager.keyFile, 0o644);

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        // A new manager in the same directory re-reads the existing key file.
        new CredentialManager();
    } finally {
        console.warn = originalWarn;
    }

    const warning = warnings.find((line) => line.includes('permissions'));
    assert.ok(warning, 'a wide-permission key file must be reported');
    assert.match(warning, /0644|644/, 'the warning names the actual mode');
    assert.ok(warning.includes(manager.keyFile), 'and the file it applies to');
    fs.rmSync(dir, { recursive: true, force: true });
});
