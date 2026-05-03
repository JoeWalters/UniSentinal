const axios = require('axios');
const https = require('https');

class NotificationManager {
    constructor() {
        this.enabled = false;
        this.providers = {};
        this._loadConfig();
    }

    _loadConfig() {
        this.enabled = process.env.NOTIFICATIONS_ENABLED === 'true';

        this.providers.pushover = {
            enabled: !!(process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER),
            token: process.env.PUSHOVER_TOKEN || '',
            user: process.env.PUSHOVER_USER || '',
            priority: parseInt(process.env.PUSHOVER_PRIORITY || '0', 10),
            sound: process.env.PUSHOVER_SOUND || 'default'
        };

        this.providers.ntfy = {
            enabled: !!(process.env.NTFY_TOPIC),
            url: (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, ''),
            topic: process.env.NTFY_TOPIC || '',
            token: process.env.NTFY_TOKEN || '',
            priority: process.env.NTFY_PRIORITY || 'default'
        };
    }

    updateConfig() {
        this._loadConfig();
    }

    isEnabled() {
        return this.enabled && (this.providers.pushover.enabled || this.providers.ntfy.enabled);
    }

    /**
     * Send a notification via all configured providers.
     * @param {string} title
     * @param {string} message
     * @param {object} [opts]
     * @param {string} [opts.url]        - Supplementary URL (Pushover)
     * @param {string} [opts.urlTitle]   - URL title (Pushover)
     * @param {string} [opts.tags]       - ntfy tags (comma-separated emoji shortcodes)
     */
    async send(title, message, opts = {}) {
        if (!this.isEnabled()) return;

        const results = await Promise.allSettled([
            this._sendPushover(title, message, opts),
            this._sendNtfy(title, message, opts)
        ]);

        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                const name = i === 0 ? 'Pushover' : 'ntfy';
                console.error(`[NotificationManager] ${name} send failed:`, r.reason?.message || r.reason);
            }
        });
    }

    async _sendPushover(title, message, opts) {
        const cfg = this.providers.pushover;
        if (!cfg.enabled) return;

        const payload = {
            token: cfg.token,
            user: cfg.user,
            title,
            message,
            priority: cfg.priority,
            sound: cfg.sound
        };

        if (opts.url) payload.url = opts.url;
        if (opts.urlTitle) payload.url_title = opts.urlTitle;

        const resp = await axios.post(
            'https://api.pushover.net/1/messages.json',
            payload,
            { timeout: 10000 }
        );

        if (resp.data.status !== 1) {
            throw new Error(`Pushover API error: ${JSON.stringify(resp.data.errors)}`);
        }
    }

    async _sendNtfy(title, message, opts) {
        const cfg = this.providers.ntfy;
        if (!cfg.enabled) return;

        const targetUrl = `${cfg.url}/${encodeURIComponent(cfg.topic)}`;

        const headers = {
            'Title': title,
            'Priority': cfg.priority,
            'Content-Type': 'text/plain'
        };

        if (opts.tags) headers['Tags'] = opts.tags;
        if (opts.url) headers['Click'] = opts.url;
        if (cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;

        await axios.post(targetUrl, message, {
            headers,
            timeout: 10000,
            // Allow self-signed certs for self-hosted ntfy
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
    }

    /**
     * Test both configured providers return a success.
     */
    async test() {
        const results = { pushover: null, ntfy: null };

        if (this.providers.pushover.enabled) {
            try {
                await this._sendPushover('UniSentinal Test', 'Push notifications are working!', {});
                results.pushover = { success: true };
            } catch (err) {
                results.pushover = { success: false, error: err.message };
            }
        }

        if (this.providers.ntfy.enabled) {
            try {
                await this._sendNtfy('UniSentinal Test', 'Push notifications are working!', { tags: 'white_check_mark' });
                results.ntfy = { success: true };
            } catch (err) {
                results.ntfy = { success: false, error: err.message };
            }
        }

        return results;
    }

    /**
     * Convenience: new device detected.
     */
    async notifyNewDevice(device) {
        const name = device.hostname || device.name || device.ip || device.mac;
        const vendor = device.vendor ? ` (${device.vendor})` : '';
        const conn = device.is_wired ? 'wired' : 'wireless';
        const title = 'New Device Detected';
        const message = `${name}${vendor}\nMAC: ${device.mac}\nIP: ${device.ip || 'unknown'}\nConnection: ${conn}`;
        await this.send(title, message, { tags: 'new,computer' });
    }

    /**
     * Convenience: watched device reconnected.
     */
    async notifyWatchedDevice(device) {
        const name = device.hostname || device.name || device.ip || device.mac;
        const title = 'Watched Device Reconnected';
        const message = `${name} has joined the network.\nMAC: ${device.mac}\nIP: ${device.ip || 'unknown'}`;
        await this.send(title, message, { tags: 'eyes,computer' });
    }

    /**
     * Convenience: suspicious device alert.
     */
    async notifySuspiciousDevice(alertType, details) {
        const title = 'Suspicious Device Alert';
        let message;
        if (alertType === 'duplicate_hostname') {
            message = `Two devices share the hostname "${details.hostname}":\n- ${details.mac1}\n- ${details.mac2}`;
        } else if (alertType === 'mac_change') {
            message = `Possible MAC change detected for "${details.name}":\nOld MAC: ${details.oldMac}\nNew MAC: ${details.newMac}`;
        } else {
            message = details.message || 'Suspicious network activity detected';
        }
        await this.send(title, message, { tags: 'warning,computer' });
    }
}

module.exports = NotificationManager;
