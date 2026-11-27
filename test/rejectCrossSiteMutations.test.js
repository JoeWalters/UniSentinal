'use strict';

// Card #45: a state-changing request from another web page must be refused.
// The middleware is exercised here without Express's router: a tiny fake `req`
// with `get()` and a fake `res` that records the status and body.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { rejectCrossSiteMutations, isCrossSite } = require('../src/middleware/rejectCrossSiteMutations');

function fakeReq({ method = 'POST', headers = {} } = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        method,
        originalUrl: '/api/parental/devices/aa:bb/block',
        get(name) {
            return lower[String(name).toLowerCase()];
        }
    };
}

function fakeRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

function run(req) {
    const res = fakeRes();
    let nexted = false;
    rejectCrossSiteMutations()(req, res, () => { nexted = true; });
    return { res, nexted };
}

const SELF = '192.168.0.10:3000';

test('a same-origin browser request is allowed through', () => {
    const { nexted, res } = run(fakeReq({
        headers: { host: SELF, origin: `http://${SELF}`, 'sec-fetch-site': 'same-origin' }
    }));
    assert.equal(nexted, true);
    assert.equal(res.statusCode, 200);
});

test('a cross-site browser request is refused with 403 and no handler runs', () => {
    const { nexted, res } = run(fakeReq({
        headers: { host: SELF, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
    }));
    assert.equal(nexted, false, 'the route handler must not run');
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /Cross-site/);
});

test('a foreign Origin is refused even when Sec-Fetch-Site is absent', () => {
    const { nexted, res } = run(fakeReq({
        headers: { host: SELF, origin: 'http://attacker.test' }
    }));
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
});

test('Sec-Fetch-Site: cross-site is refused even without an Origin header', () => {
    const { nexted, res } = run(fakeReq({
        headers: { host: SELF, 'sec-fetch-site': 'cross-site' }
    }));
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
});

test('Origin: null (sandboxed frame, file://) is refused', () => {
    const { nexted, res } = run(fakeReq({ headers: { host: SELF, origin: 'null' } }));
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
});

test('a request with no Origin and no Sec-Fetch-Site (curl, script) is allowed', () => {
    // The operator's own scripts and health checks must keep working.
    const { nexted } = run(fakeReq({ headers: { host: SELF } }));
    assert.equal(nexted, true);
});

test('read-only methods are never blocked', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        const { nexted } = run(fakeReq({
            method,
            headers: { host: SELF, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
        }));
        assert.equal(nexted, true, `${method} must not be blocked`);
    }
});

test('every mutating method is covered', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const { nexted, res } = run(fakeReq({
            method,
            headers: { host: SELF, origin: 'https://evil.example' }
        }));
        assert.equal(nexted, false, `${method} must be blocked`);
        assert.equal(res.statusCode, 403);
    }
});

test('same-site-but-different-port is still this app when Origin matches Host', () => {
    // The UI is served from the same origin it calls, so these must agree.
    const { nexted } = run(fakeReq({
        headers: { host: 'unraid.local:3000', origin: 'http://unraid.local:3000', 'sec-fetch-site': 'same-origin' }
    }));
    assert.equal(nexted, true);
});

test('isCrossSite is the pure predicate behind the middleware', () => {
    assert.equal(isCrossSite(fakeReq({ headers: { host: SELF, origin: `http://${SELF}` } })), false);
    assert.equal(isCrossSite(fakeReq({ headers: { host: SELF, origin: 'https://evil.example' } })), true);
    assert.equal(isCrossSite(fakeReq({ headers: { host: SELF } })), false);
});
