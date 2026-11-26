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
