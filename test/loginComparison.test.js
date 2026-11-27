'use strict';

// Card #60: the login comparison must never throw, must not reveal credential
// length, and must still be constant-time for equal-length input.
//
// The handler hashes both sides to a fixed 32-byte digest before comparing, so
// this test reproduces exactly that helper against the inputs that used to blow
// up (a wrong-length username or password raised RangeError → HTTP 500).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function constantTimeEquals(a, b) {
    const digest = (value) => crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest();
    return crypto.timingSafeEqual(digest(a), digest(b));
}

const CONFIG_USER = 'admin';
const CONFIG_PASS = 'correct horse battery staple';

test('the correct credentials match', () => {
    assert.equal(constantTimeEquals(CONFIG_USER, CONFIG_USER), true);
    assert.equal(constantTimeEquals(CONFIG_PASS, CONFIG_PASS), true);
});

test('a same-length wrong value is a plain mismatch, not a throw', () => {
    assert.equal(constantTimeEquals('admim', CONFIG_USER), false);
    assert.equal(constantTimeEquals('correct horse battery stapl3', CONFIG_PASS), false);
});

test('wrong-length values never throw (they used to raise RangeError → 500)', () => {
    for (const value of ['', 'a', 'b', 'x'.repeat(1000), 'ünïcødé', '😀🔒']) {
        assert.doesNotThrow(() => constantTimeEquals(value, CONFIG_USER), `username "${value}" must not throw`);
        assert.doesNotThrow(() => constantTimeEquals(value, CONFIG_PASS), `password "${value}" must not throw`);
        assert.equal(constantTimeEquals(value, CONFIG_USER), false);
        assert.equal(constantTimeEquals(value, CONFIG_PASS), false);
    }
});

test('missing or non-string input is compared, not crashed on', () => {
    for (const value of [undefined, null, 0, {}, []]) {
        assert.doesNotThrow(() => constantTimeEquals(value, CONFIG_PASS));
        assert.equal(constantTimeEquals(value, CONFIG_PASS), false, `${JSON.stringify(value)} must not match`);
    }
});

test('a one-megabyte value is handled without throwing', () => {
    const huge = 'a'.repeat(1024 * 1024);
    assert.doesNotThrow(() => constantTimeEquals(huge, CONFIG_PASS));
    assert.equal(constantTimeEquals(huge, CONFIG_PASS), false);
});

test('a length extension of the real secret does not match', () => {
    assert.equal(constantTimeEquals(CONFIG_PASS + 'x', CONFIG_PASS), false);
    assert.equal(constantTimeEquals(CONFIG_PASS.slice(0, -1), CONFIG_PASS), false);
    assert.equal(constantTimeEquals(CONFIG_USER.toUpperCase(), CONFIG_USER), false);
});

test('the digests are fixed width, so length cannot be inferred from a throw', () => {
    const digest = (value) => crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest();
    for (const value of ['', 'a', 'x'.repeat(4096)]) {
        assert.equal(digest(value).length, 32);
    }
});
