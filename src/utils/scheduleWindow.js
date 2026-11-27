// Pure time/date helpers for parental-control schedule evaluation.
// No I/O, no Express, no dependencies. Keeps schedule logic testable and
// timezone/DST-safe (we never do epoch arithmetic; Intl handles the zone).

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// The timezone used for schedule evaluation. Prefers an explicit TZ env var
// (loaded from CONFIG_DIR/.env by dotenv before controllers are required),
// falling back to the host's resolved zone, then undefined (Intl's default).
function resolveDefaultTimeZone() {
    if (process.env.TZ) return process.env.TZ;
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch (error) {
        return undefined;
    }
}

// Parse "HH:MM", "H:MM", or "HH:MM:SS" (trimmed) into a minute-of-day integer
// 0..1439. Returns null for anything else (no throwing).
function parseTimeToMinutes(value) {
    if (value == null) return null;
    const str = String(value).trim();
    const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
}

// Inclusive at both ends. start > end means the window spans midnight.
function isMinuteInWindow(minute, startMinute, endMinute) {
    if (minute == null || startMinute == null || endMinute == null) return false;
    if (startMinute < endMinute) {
        return minute >= startMinute && minute <= endMinute;
    }
    if (startMinute > endMinute) {
        return minute >= startMinute || minute <= endMinute;
    }
    // Equal start/end: preserve the old same-minute behaviour (a single minute).
    return minute === startMinute;
}

// Resolve a Date into { dayIndex, minuteOfDay } for the given timeZone.
// timeZone undefined/'' uses the host zone. An invalid zone falls back to the
// host zone. DST-safe by construction.
function getZonedParts(date, timeZone) {
    const tz = timeZone || undefined;
    let formatter;
    try {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hourCycle: 'h23',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (error) {
        // Invalid zone: fall back to the host zone.
        formatter = new Intl.DateTimeFormat('en-US', {
            hourCycle: 'h23',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    const parts = formatter.formatToParts(date);
    const find = (type) => {
        const part = parts.find((p) => p.type === type);
        return part ? part.value : null;
    };
    const weekday = find('weekday');
    const hour = parseInt(find('hour'), 10);
    const minute = parseInt(find('minute'), 10);
    let dayIndex = DAY_NAMES.indexOf(weekday ? weekday.toLowerCase() : '');
    if (dayIndex < 0) dayIndex = 0;
    return { dayIndex, minuteOfDay: hour * 60 + minute };
}

module.exports = {
    DAY_NAMES,
    resolveDefaultTimeZone,
    parseTimeToMinutes,
    isMinuteInWindow,
    getZonedParts,
};
