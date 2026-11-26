'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    DAY_NAMES,
    parseTimeToMinutes,
    isMinuteInWindow,
    getZonedParts,
} = require('../src/utils/scheduleWindow');

test('DAY_NAMES matches schedule_data day keys (sunday..saturday)', () => {
    assert.deepEqual(DAY_NAMES, [
        'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ]);
});

test('parseTimeToMinutes parses valid "HH:MM" / "H:MM" / "HH:MM:SS" (trimmed)', () => {
    assert.equal(parseTimeToMinutes('22:00'), 1320);
    assert.equal(parseTimeToMinutes('8:05'), 485);
    assert.equal(parseTimeToMinutes('22:00:30'), 1320);
    assert.equal(parseTimeToMinutes(' 07:30 '), 450);
    assert.equal(parseTimeToMinutes('00:00'), 0);
    assert.equal(parseTimeToMinutes('23:59'), 1439);
});

test('parseTimeToMinutes returns null for invalid values (never throws)', () => {
    assert.equal(parseTimeToMinutes('abc'), null);
    assert.equal(parseTimeToMinutes('25:00'), null);
    assert.equal(parseTimeToMinutes('22:60'), null);
    assert.equal(parseTimeToMinutes(''), null);
    assert.equal(parseTimeToMinutes('22:00:xx'), null);
    assert.equal(parseTimeToMinutes(null), null);
    assert.equal(parseTimeToMinutes(undefined), null);
});

test('isMinuteInWindow is inclusive for a normal (start < end) window', () => {
    assert.equal(isMinuteInWindow(720, 540, 1020), true);  // 12:00 within 09:00-17:00
    assert.equal(isMinuteInWindow(540, 540, 1020), true);  // inclusive start
    assert.equal(isMinuteInWindow(1020, 540, 1020), true); // inclusive end
    assert.equal(isMinuteInWindow(1080, 540, 1020), false); // 18:00 outside
});

test('isMinuteInWindow spans midnight when start > end (inclusive)', () => {
    assert.equal(isMinuteInWindow(1410, 1320, 480), true);  // 23:30 within 22:00-08:00
    assert.equal(isMinuteInWindow(450, 1320, 480), true);   // 07:30 within 22:00-08:00
    assert.equal(isMinuteInWindow(1320, 1320, 480), true);  // inclusive start
    assert.equal(isMinuteInWindow(480, 1320, 480), true);   // inclusive end
    assert.equal(isMinuteInWindow(720, 1320, 480), false);  // 12:00 outside
});

test('isMinuteInWindow with equal start/end matches only that minute', () => {
    assert.equal(isMinuteInWindow(720, 720, 720), true);
    assert.equal(isMinuteInWindow(721, 720, 720), false);
});

test('isMinuteInWindow returns false when any input is null', () => {
    assert.equal(isMinuteInWindow(null, 1320, 480), false);
    assert.equal(isMinuteInWindow(720, null, 480), false);
    assert.equal(isMinuteInWindow(720, 1320, null), false);
});

test('getZonedParts resolves the fixed instant in America/New_York and UTC', () => {
    // 2026-01-14T12:30:00Z = 07:30 EST (Wednesday) and 12:30 UTC (Wednesday).
    const ny = getZonedParts(new Date('2026-01-14T12:30:00Z'), 'America/New_York');
    assert.equal(ny.dayIndex, 3); // wednesday
    assert.equal(ny.minuteOfDay, 450); // 07:30

    const utc = getZonedParts(new Date('2026-01-14T12:30:00Z'), 'UTC');
    assert.equal(utc.dayIndex, 3);
    assert.equal(utc.minuteOfDay, 750); // 12:30
});

test('getZonedParts with undefined timeZone falls back to the host zone', () => {
    const parts = getZonedParts(new Date('2026-01-14T12:30:00Z'), undefined);
    assert.ok(parts.dayIndex >= 0 && parts.dayIndex <= 6);
    assert.ok(parts.minuteOfDay >= 0 && parts.minuteOfDay <= 1439);
});
