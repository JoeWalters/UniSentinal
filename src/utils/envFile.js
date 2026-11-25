'use strict';

// The only keys POST /api/settings is allowed to write into .env.
// This is exactly the set the settings UI owns (GET /api/settings + the modal).
// Deliberately excluded: UI_AUTH_ENABLED, SESSION_SECRET, CONFIG_DIR, DB_PATH, and anything else.
const WRITABLE_SETTINGS = Object.freeze([
    'UNIFI_HOST',
    'UNIFI_PORT',
    'UNIFI_USERNAME',
    'UNIFI_PASSWORD',
    'UNIFI_SITE',
    'PORT',
    'SCAN_INTERVAL',
    'NOTIFICATIONS_ENABLED',
    'NOTIFY_NEW_DEVICE',
    'NOTIFY_WATCHED_DEVICE',
    'PUSHOVER_ENABLED',
    'PUSHOVER_TOKEN',
    'PUSHOVER_USER',
    'PUSHOVER_PRIORITY',
    'PUSHOVER_SOUND',
    'NTFY_ENABLED',
    'NTFY_URL',
    'NTFY_TOPIC',
    'NTFY_TOKEN',
    'NTFY_USERNAME',
    'NTFY_PASSWORD',
    'NTFY_PRIORITY',
    'UI_USERNAME',
    'UI_PASSWORD'
]);

const WRITABLE_SET = new Set(WRITABLE_SETTINGS);

/**
 * Validate a settings payload against the allowlist.
 * Returns { values, ignoredKeys, invalid }.
 * - values:      { normalisedKey: String(value) } for allowed, non-empty values.
 * - ignoredKeys: raw keys (as sent) that are not in the allowlist.
 * - invalid:     [{ key, reason }] for values that must be rejected (newlines / comment-leading).
 */
function validateSettingsPayload(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return {
            values: {},
            ignoredKeys: [],
            invalid: [{ key: null, reason: 'Body must be a JSON object.' }]
        };
    }

    const values = {};
    const ignoredKeys = [];
    const invalid = [];

    for (const rawKey of Object.keys(body)) {
        const key = String(rawKey).trim();
        const value = body[rawKey];

        if (!WRITABLE_SET.has(key)) {
            ignoredKeys.push(rawKey);
            continue;
        }

        // Skip empty/undefined values entirely (keeps existing .env lines intact).
        if (value === undefined || value === null || value === '') {
            continue;
        }

        const str = String(value);

        if (str.includes('\n') || str.includes('\r')) {
            invalid.push({ key, reason: 'Value must not contain newline characters.' });
            continue;
        }
        if (str.trimStart().startsWith('#')) {
            invalid.push({ key, reason: 'Value must not start with a comment character.' });
            continue;
        }

        values[key] = str;
    }

    return { values, ignoredKeys, invalid };
}

/**
 * Apply validated values to an existing .env content string.
 * Returns the new content string. Returns content unchanged when values is empty.
 */
function applySettingsToEnv(envContent, values) {
    if (!values || Object.keys(values).length === 0) {
        return envContent;
    }

    let content = envContent;

    for (const key of Object.keys(values)) {
        const value = values[key];
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^${escaped}=.*$`, 'm');
        const line = `${key}=${value}`;

        // Function replacer so $& / $1 in a value is never expanded.
        if (pattern.test(content)) {
            content = content.replace(pattern, () => line);
        } else {
            content += `${content.endsWith('\n') ? '' : '\n'}${line}\n`;
        }
    }

    return content;
}

module.exports = {
    WRITABLE_SETTINGS,
    validateSettingsPayload,
    applySettingsToEnv
};
