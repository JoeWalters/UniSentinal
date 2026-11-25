'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    WRITABLE_SETTINGS,
    validateSettingsPayload,
    applySettingsToEnv
} = require('../src/utils/envFile');

test('newline value is rejected and produces no values', () => {
    const { values, ignoredKeys, invalid } = validateSettingsPayload({
        UNIFI_SITE: 'default\nUNIFI_HOST=evil.lan'
    });
    assert.ok(invalid.length > 0);
    assert.equal(invalid[0].key, 'UNIFI_SITE');
    assert.deepEqual(Object.keys(values), []);
    assert.deepEqual(ignoredKeys, []);
});

test('comment-leading value is rejected and produces no values', () => {
    const { values, invalid } = validateSettingsPayload({
        UNIFI_SITE: '#comment'
    });
    assert.ok(invalid.length > 0);
    assert.equal(invalid[0].key, 'UNIFI_SITE');
    assert.deepEqual(Object.keys(values), []);
});

test('injected newline does not create a UNIFI_HOST entry (AC6)', () => {
    const { values } = validateSettingsPayload({
        UNIFI_SITE: 'default\nUNIFI_HOST=evil.lan'
    });
    // Nothing is valid, so nothing can be written.
    const content = applySettingsToEnv('UNIFI_HOST=192.168.0.1\n', values);
    assert.equal(content, 'UNIFI_HOST=192.168.0.1\n');
    assert.ok(!content.includes('UNIFI_HOST=evil.lan'));
});

test('non-allowlisted keys are ignored and absent from values', () => {
    const { values, ignoredKeys } = validateSettingsPayload({
        SESSION_SECRET: 'nope',
        CONFIG_DIR: '/tmp/config',
        DB_PATH: '/tmp/x'
    });
    assert.deepEqual(ignoredKeys.sort(), ['CONFIG_DIR', 'DB_PATH', 'SESSION_SECRET'].sort());
    assert.deepEqual(Object.keys(values), []);
});

test('UI_AUTH_ENABLED is writable so the settings modal can enable auth', () => {
    const { values, ignoredKeys, invalid } = validateSettingsPayload({ UI_AUTH_ENABLED: 'true' });
    assert.deepEqual(ignoredKeys, []);
    assert.deepEqual(invalid, []);
    assert.deepEqual(values, { UI_AUTH_ENABLED: 'true' });
});

test('allowlisted key updates an existing line in place without duplicating', () => {
    const content = applySettingsToEnv('UNIFI_HOST=192.168.0.1\n', {
        UNIFI_HOST: 'new.host'
    });
    assert.equal(content, 'UNIFI_HOST=new.host\n');
    assert.equal(content.split('UNIFI_HOST=').length - 1, 1);
});

test('missing allowlisted key is appended with a single trailing newline', () => {
    const content = applySettingsToEnv('UNIFI_HOST=192.168.0.1\n', {
        UNIFI_SITE: 'default'
    });
    assert.equal(content, 'UNIFI_HOST=192.168.0.1\nUNIFI_SITE=default\n');
    assert.ok(content.endsWith('\n'));
    assert.ok(!content.endsWith('\n\n'));
});

test('value containing $& round-trips unchanged (function replacer)', () => {
    const content = applySettingsToEnv('UNIFI_HOST=192.168.0.1\n', {
        UNIFI_HOST: 'a$&b'
    });
    assert.equal(content, 'UNIFI_HOST=a$&b\n');
});

test('empty-string values are skipped (no .env line written)', () => {
    const { values } = validateSettingsPayload({
        UNIFI_HOST: '',
        UNIFI_SITE: 'default'
    });
    assert.deepEqual(Object.keys(values), ['UNIFI_SITE']);
    const content = applySettingsToEnv('UNIFI_HOST=192.168.0.1\n', values);
    assert.equal(content, 'UNIFI_HOST=192.168.0.1\nUNIFI_SITE=default\n');
});

test('regex-shaped raw key is ignored and leaves UNIFI_HOST untouched', () => {
    const { values, ignoredKeys } = validateSettingsPayload({
        'PORT|UNIFI_HOST': '1.2.3.4'
    });
    assert.deepEqual(ignoredKeys, ['PORT|UNIFI_HOST']);
    assert.deepEqual(Object.keys(values), []);
    const content = applySettingsToEnv('UNIFI_HOST=192.168.0.1\n', values);
    assert.equal(content, 'UNIFI_HOST=192.168.0.1\n');
});

test('non-object body is invalid', () => {
    const { values, invalid } = validateSettingsPayload(['UNIFI_HOST', 'x']);
    assert.deepEqual(Object.keys(values), []);
    assert.ok(invalid.length > 0);
    assert.equal(invalid[0].key, null);
});

test('WRITABLE_SETTINGS is frozen and excludes the non-settable keys', () => {
    assert.ok(Object.isFrozen(WRITABLE_SETTINGS));
    assert.ok(!WRITABLE_SETTINGS.includes('SESSION_SECRET'));
    assert.ok(!WRITABLE_SETTINGS.includes('DB_PATH'));
    assert.ok(WRITABLE_SETTINGS.includes('UI_USERNAME'));
    assert.ok(WRITABLE_SETTINGS.includes('UI_PASSWORD'));
    assert.ok(WRITABLE_SETTINGS.includes('UI_AUTH_ENABLED'));
});
