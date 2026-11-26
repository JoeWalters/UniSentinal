'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ParentalControlsManager = require('../src/controllers/ParentalControlsManager');

// The manager evaluates schedules in its configured timezone; AC4 instants are
// chosen in America/New_York in winter (EST = UTC-5) so there is no DST ambiguity.
const NY = 'America/New_York';

// A Wednesday 22:00-08:00 overnight window (inclusive at both ends).
const overnight = {
    wednesday: { blockedPeriods: [{ start: '22:00', end: '08:00' }] },
};
// A Wednesday 09:00-17:00 daytime window.
const daytime = {
    wednesday: { blockedPeriods: [{ start: '09:00', end: '17:00' }] },
};

// Fixed instants. EST = UTC-5, so local EST time = UTC time - 5h.
const instants = {
    // Jan 14 2026 is a Wednesday.
    wed2300: new Date('2026-01-15T04:30:00Z'), // Jan 14 23:30 EST
    wed0730: new Date('2026-01-14T12:30:00Z'), // Jan 14 07:30 EST
    wed1200: new Date('2026-01-14T17:00:00Z'), // Jan 14 12:00 EST
    wed1800: new Date('2026-01-14T23:00:00Z'), // Jan 14 18:00 EST
    // Jan 15 2026 is a Thursday.
    thu0730: new Date('2026-01-15T12:30:00Z'), // Jan 15 07:30 EST
};

function callIsBlocked(timeZone, schedule, instant) {
    return ParentalControlsManager.prototype.isBlockedBySchedule.call(
        { timeZone }, schedule, instant
    );
}

test('AC4: 22:00-08:00 overnight window blocks at 23:30 and 07:30, unblocks at 12:00', () => {
    assert.equal(callIsBlocked(NY, overnight, instants.wed2300), true);
    assert.equal(callIsBlocked(NY, overnight, instants.wed0730), true);
    assert.equal(callIsBlocked(NY, overnight, instants.wed1200), false);
});

test('AC4: 09:00-17:00 daytime window blocks at 12:00, unblocks at 18:00', () => {
    assert.equal(callIsBlocked(NY, daytime, instants.wed1200), true);
    assert.equal(callIsBlocked(NY, daytime, instants.wed1800), false);
});

test('AC4: previous day overnight window carries over (Wed 22:00-08:00 covers Thu 07:30)', () => {
    // Only Wednesday defines a window; Thursday 07:30 must still be blocked.
    assert.equal(callIsBlocked(NY, overnight, instants.thu0730), true);
});

test('AC2: the same instant evaluates differently in UTC vs America/New_York', () => {
    // 2026-01-14T10:00:00Z = 10:00 UTC (outside window) but 05:00 EST (inside window).
    const instant = new Date('2026-01-14T10:00:00Z');
    assert.equal(callIsBlocked('UTC', overnight, instant), false);
    assert.equal(callIsBlocked(NY, overnight, instant), true);
});

test('AC2: invalid timezone falls back to host zone without throwing', () => {
    assert.equal(callIsBlocked('Not/AZone', overnight, instants.wed2300), true);
});

test('AC4: null/absent scheduleData is never blocked', () => {
    assert.equal(callIsBlocked(NY, null, instants.wed2300), false);
    assert.equal(callIsBlocked(NY, undefined, instants.wed2300), false);
});

test('AC4: unparseable period times are skipped, never throw', () => {
    const bad = { wednesday: { blockedPeriods: [{ start: 'not-a-time', end: '08:00' }] } };
    assert.equal(callIsBlocked(NY, bad, instants.wed2300), false);
});

// ── Enforcement pass (AC3 / AC6 / AC7) ─────────────────────────────────────

// Patch the global Date constructor so the pass sees a fixed "now". The schedule
// window is relative to the fixed instant, making the pass deterministic.
async function withFixedTime(iso, fn) {
    const RealDate = global.Date;
    const fixed = new RealDate(iso);
    class FakeDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) return new RealDate(iso);
            return new RealDate(...args);
        }
        static now() { return fixed.getTime(); }
    }
    global.Date = FakeDate;
    try {
        await fn();
    } finally {
        global.Date = RealDate;
    }
}

function makeController(blocked = [], opts = {}) {
    const calls = { block: [], unblock: [] };
    return {
        isConfigured: () => true,
        getBlockedDevices: async (options) => {
            if (opts.throwStrict && options && options.strict) throw new Error('controller down');
            return blocked.map((mac) => ({ mac }));
        },
        blockDevice: async (mac) => { calls.block.push(mac); return true; },
        unblockDevice: async (mac) => { calls.unblock.push(mac); return true; },
        calls,
    };
}

function makeDb(devices) {
    const calls = { updateBlockStatus: [] };
    return {
        getManagedDevices: async () => devices,
        logParentalAction: async () => {},
        updateDeviceBlockStatus: async (...args) => { calls.updateBlockStatus.push(args); },
        calls,
    };
}

function makeManager(controller, db, devices) {
    const mgr = Object.create(ParentalControlsManager.prototype);
    mgr.unifiController = controller;
    mgr.db = db;
    mgr.blockedDevices = new Set();
    mgr.bonusTimeTimers = new Map();
    mgr.timeZone = NY;
    return mgr;
}

function scheduledDevice(mac, overrides = {}) {
    return {
        mac,
        is_scheduled: 1,
        schedule_data: JSON.stringify(overnight),
        is_blocked: 0,
        ...overrides,
    };
}

// Jan 14 23:30 EST (in window) and Jan 14 12:00 EST (out of window).
const IN_WINDOW = '2026-01-15T04:30:00Z';
const OUT_WINDOW = '2026-01-14T17:00:00Z';

test('AC3: window open + not blocked -> one block call, no status write', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeController([]);
    const db = makeDb([scheduledDevice(mac)]);
    const mgr = makeManager(controller, db, [scheduledDevice(mac)]);

    await withFixedTime(IN_WINDOW, () => mgr.enforceParentalRules());

    assert.deepEqual(controller.calls.block, [mac]);
    assert.deepEqual(controller.calls.unblock, []);
    assert.deepEqual(db.calls.updateBlockStatus, []); // AC7
});

test('AC6: window open + already blocked -> zero calls', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeController([mac]);
    const db = makeDb([scheduledDevice(mac)]);
    const mgr = makeManager(controller, db, [scheduledDevice(mac)]);

    await withFixedTime(IN_WINDOW, () => mgr.enforceParentalRules());

    assert.deepEqual(controller.calls.block, []);
    assert.deepEqual(controller.calls.unblock, []);
    assert.deepEqual(db.calls.updateBlockStatus, []); // AC7
});

test('AC3: window closed + blocked + is_blocked=0 -> one unblock call', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeController([mac]);
    const db = makeDb([scheduledDevice(mac)]);
    const mgr = makeManager(controller, db, [scheduledDevice(mac)]);

    await withFixedTime(OUT_WINDOW, () => mgr.enforceParentalRules());

    assert.deepEqual(controller.calls.block, []);
    assert.deepEqual(controller.calls.unblock, [mac]);
    assert.deepEqual(db.calls.updateBlockStatus, []); // AC7
});

test('AC3/AC6: window closed + blocked + is_blocked=1 (manual) -> zero calls, stays blocked', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeController([mac]);
    const db = makeDb([scheduledDevice(mac, { is_blocked: 1 })]);
    const mgr = makeManager(controller, db, [scheduledDevice(mac, { is_blocked: 1 })]);

    await withFixedTime(OUT_WINDOW, () => mgr.enforceParentalRules());

    assert.deepEqual(controller.calls.block, []);
    assert.deepEqual(controller.calls.unblock, []);
    assert.deepEqual(db.calls.updateBlockStatus, []); // AC7
});

test('AC3: controller throws with strict -> zero calls, no throw', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeController([], { throwStrict: true });
    const db = makeDb([scheduledDevice(mac)]);
    const mgr = makeManager(controller, db, [scheduledDevice(mac)]);

    await withFixedTime(IN_WINDOW, () => mgr.enforceParentalRules());

    assert.deepEqual(controller.calls.block, []);
    assert.deepEqual(controller.calls.unblock, []);
    assert.deepEqual(db.calls.updateBlockStatus, []); // AC7
});

test('AC3: an active bonus timer owns the device -> zero calls', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeController([]);
    const db = makeDb([scheduledDevice(mac)]);
    const mgr = makeManager(controller, db, [scheduledDevice(mac)]);
    mgr.bonusTimeTimers.set(mac, { timer: null, endTime: new Date() });

    await withFixedTime(IN_WINDOW, () => mgr.enforceParentalRules());

    assert.deepEqual(controller.calls.block, []);
    assert.deepEqual(controller.calls.unblock, []);
    assert.deepEqual(db.calls.updateBlockStatus, []); // AC7
});

// ── Status reconcile (AC5 / AC7): never clear manual blocks on unknown state ──

function makeStatusController(devices, opts = {}) {
    return {
        isConfigured: () => true,
        getAllKnownDevices: async () => devices,
        getBlockedDevices: async (options) => {
            // Mirrors UnifiController: non-strict swallows the error into [].
            if (opts.failBlockedFetch) {
                if (options && options.strict) throw new Error('controller down');
                return [];
            }
            return (opts.blocked || []).map((mac) => ({ mac }));
        },
    };
}

test('reconcile does not clear a manual block when the blocked-users fetch failed', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeStatusController([{ mac }], { failBlockedFetch: true });
    const db = makeDb([scheduledDevice(mac, { is_blocked: 1 })]);
    const mgr = makeManager(controller, db, []);

    const result = await mgr.getManagedDevicesStatus();

    // Unknown controller state: no status write, and the reported device is unchanged.
    assert.deepEqual(db.calls.updateBlockStatus, []);
    assert.equal(result.length, 1);
});

test('reconcile clears a manual block the controller no longer reports', async () => {
    const mac = 'AA:BB:CC:DD:EE:FF';
    const controller = makeStatusController([{ mac }], { blocked: [] });
    const db = makeDb([scheduledDevice(mac, { is_blocked: 1 })]);
    const mgr = makeManager(controller, db, []);

    await mgr.getManagedDevicesStatus();

    assert.equal(db.calls.updateBlockStatus.length, 1);
    assert.deepEqual(db.calls.updateBlockStatus[0].slice(0, 3), [mac.toLowerCase(), false, 'sync_with_unifi']);
    assert.deepEqual(db.calls.updateBlockStatus[0][4], { log: false }); // AC7: no activity log
});
