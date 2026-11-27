'use strict';

// Card #44: re-adding a managed device must not reset its state.
//
// `addManagedDevice` used INSERT OR REPLACE, which is DELETE-then-INSERT: every
// column it did not name went back to its DEFAULT, so "remove from parental
// controls, then add it again" wiped the schedule, the block state and the
// bonus time. These tests run against a real (temporary) sqlite database.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us44-'));
process.env.CONFIG_DIR = tmpDir;
process.env.DB_PATH = path.join(tmpDir, 'devices.db');

const DatabaseManager = require('../src/database/DatabaseManager');

const SCHEDULE = {
    monday: { blockedPeriods: [{ start: '22:00', end: '08:00' }] },
    tuesday: { blockedPeriods: [{ start: '22:00', end: '08:00' }] }
};

async function freshDatabase() {
    const db = new DatabaseManager();
    await db.initialize();
    return db;
}

// getManagedDevice() only returns managed rows, and the point of this test is
// what happens while the row is *un*managed.
function readRow(db, mac) {
    return db.db.prepare('SELECT * FROM parental_controls WHERE mac = ?').get(mac);
}

test('re-adding a managed device keeps its schedule, block state and bonus time', async () => {
    const db = await freshDatabase();
    const mac = 'aa:bb:cc:dd:ee:44';

    await db.addManagedDevice({ mac, device_name: 'Kid iPad', ip: '192.168.0.44', vendor: 'Apple' });
    await db.updateDeviceSchedule(mac, SCHEDULE);
    await db.updateDeviceBlockStatus(mac, true, 'schedule');
    await db.updateDeviceTimeLimit(mac, 60, 45);

    const before = await db.getManagedDevice(mac);
    assert.equal(before.is_scheduled, 1);
    assert.equal(before.is_blocked, 1);
    assert.equal(before.bonus_time, 45);
    assert.deepEqual(JSON.parse(before.schedule_data), SCHEDULE);

    // "Remove from Parental Controls" only flips is_managed, so the device is
    // offered again by the add-device flow and gets re-added.
    await db.removeManagedDevice(mac);
    assert.equal(readRow(db, mac).is_managed, 0, 'remove keeps the row, unmanaged');
    assert.equal(await db.getManagedDevice(mac), undefined, 'and it is no longer offered as managed');

    await db.addManagedDevice({ mac, device_name: 'Kid iPad (renamed)', ip: '192.168.0.99', vendor: 'Apple' });

    const after = await db.getManagedDevice(mac);
    assert.equal(after.is_managed, 1, 're-add must mark the device managed again');
    assert.equal(after.device_name, 'Kid iPad (renamed)', 'the new name is applied');
    assert.equal(after.ip, '192.168.0.99', 'the new ip is applied');
    assert.equal(after.is_scheduled, 1, 'schedule flag survives');
    assert.deepEqual(JSON.parse(after.schedule_data), SCHEDULE, 'schedule survives');
    assert.equal(after.is_blocked, 1, 'block state survives');
    assert.equal(after.bonus_time, 45, 'bonus time survives');
    assert.equal(after.daily_time_limit, 60, 'time limit survives');
    assert.ok(after.created_at, 'created_at is not lost');
});

test('re-adding does not resurrect a stale ip when the controller has none', async () => {
    const db = await freshDatabase();
    const mac = 'aa:bb:cc:dd:ee:45';

    await db.addManagedDevice({ mac, device_name: 'Phone', ip: '192.168.0.45', vendor: 'Apple' });
    await db.addManagedDevice({ mac, device_name: 'Phone', ip: null, vendor: null });

    const row = readRow(db, mac);
    assert.equal(row.ip, '192.168.0.45', 'a missing ip must not blank the stored one');
    assert.equal(row.vendor, 'Apple');
});

test('a rescan of an unchanged network reports zero genuinely new devices', async () => {
    const db = await freshDatabase();

    const scanned = [
        { mac: 'aa:bb:cc:dd:ee:46', name: 'iPad', ip: '192.168.0.46', is_online: true },
        { mac: 'aa:bb:cc:dd:ee:47', name: 'Phone', ip: '192.168.0.47', is_online: true }
    ];

    const first = await db.addNewDevices(scanned);
    assert.equal(first.newDevices.length, 2, 'both devices are new on the first scan');

    const second = await db.addNewDevices(scanned);
    assert.equal(second.newDevices.length, 0, 'an unchanged network has nothing new to report');

    const third = await db.addNewDevices([
        ...scanned,
        { mac: 'aa:bb:cc:dd:ee:48', name: 'Laptop', ip: '192.168.0.48', is_online: true }
    ]);
    assert.equal(third.newDevices.length, 1, 'only the genuinely new device is reported');
    assert.equal(third.newDevices[0].mac, 'aa:bb:cc:dd:ee:48');
});

test.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
