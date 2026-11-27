const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Every credential the app accepts. One list feeds encryptSettings,
// decryptSettings and sanitizeForLogging so no field is ever missed.
const SENSITIVE_FIELDS = Object.freeze([
    'UNIFI_PASSWORD',
    'DATABASE_PASSWORD',
    'API_KEY',
    'SECRET_KEY',
    'PUSHOVER_TOKEN',
    'PUSHOVER_USER',
    'NTFY_TOKEN',
    'NTFY_PASSWORD',
    'UI_PASSWORD',
]);

class CredentialManager {
    constructor() {
        // AES-256-GCM: confidentiality *and* integrity. CBC alone cannot tell
        // "wrong key" from "somebody edited the stored value".
        this.algorithm = 'aes-256-gcm';
        this.legacyAlgorithm = 'aes-256-cbc';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // legacy CBC IV
        this.gcmIvLength = 12;
        this.tagLength = 16;
        this.keyWasGenerated = false;
        this.keyFile = path.join(process.env.CONFIG_DIR || './config', '.key');
        this.masterKey = this.getMasterKey();
    }

    /**
     * Get or generate master encryption key
     */
    getMasterKey() {
        try {
            // Try to read existing key
            if (fs.existsSync(this.keyFile)) {
                const keyData = fs.readFileSync(this.keyFile);
                if (keyData.length === this.keyLength) {
                    this.warnIfKeyPermissionsAreWide();
                    return keyData;
                }
                console.warn(`[SECURITY] Key file ${this.keyFile} has ${keyData.length} bytes, expected ${this.keyLength}; generating a new one`);
            }
            
            // Generate new key if doesn't exist or is invalid
            console.log('[SECURITY] Generating new master encryption key');
            this.keyWasGenerated = true;
            const newKey = crypto.randomBytes(this.keyLength);
            
            // Ensure config directory exists
            const configDir = path.dirname(this.keyFile);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
            }
            
            // Save key with restricted permissions
            fs.writeFileSync(this.keyFile, newKey, { mode: 0o600 });
            
            console.log('[SECURITY] Master key saved to:', this.keyFile);
            return newKey;
            
        } catch (error) {
            console.error('[SECURITY] Error managing master key:', error.message);
            throw new Error('Failed to initialize encryption key');
        }
    }

    /**
     * Warn if an existing key file is readable by anyone but its owner.
     * A key created here is 0600, but a copied or container-mounted file may not be.
     */
    warnIfKeyPermissionsAreWide() {
        try {
            const mode = fs.statSync(this.keyFile).mode & 0o777;
            if (mode & 0o077) {
                console.warn(
                    `[SECURITY] Key file ${this.keyFile} has permissions ${mode.toString(8).padStart(4, '0')}; ` +
                    'it should be 0600 (owner-only). Fix with: chmod 600 ' + this.keyFile
                );
            }
        } catch (error) {
            console.warn(`[SECURITY] Could not stat key file ${this.keyFile}: ${error.message}`);
        }
    }

    /**
     * Encrypt sensitive data
     */
    encrypt(plaintext) {
        if (!plaintext || typeof plaintext !== 'string') {
            return plaintext; // Return as-is for empty/non-string values
        }

        try {
            const iv = crypto.randomBytes(this.gcmIvLength);
            const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

            const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();

            // iv || auth tag || ciphertext, base64-encoded behind the v2 marker.
            const combined = Buffer.concat([iv, tag, ciphertext]);
            return 'encrypted:v2:' + combined.toString('base64');

        } catch (error) {
            console.error('[SECURITY] Encryption error:', error.message);
            throw new Error('Failed to encrypt credential');
        }
    }

    /**
     * Decrypt sensitive data
     */
    decrypt(encryptedData) {
        if (!encryptedData || typeof encryptedData !== 'string') {
            return encryptedData; // Return as-is for empty/non-string values
        }

        // Check if data is encrypted
        if (!encryptedData.startsWith('encrypted:')) {
            return encryptedData; // Return as-is for unencrypted data
        }

        return this.decryptDetailed(encryptedData).value;
    }

    /**
     * Decrypt with a reason, so "the key is wrong/missing" and "the stored value
     * was altered" are not reported as the same generic failure.
     * Returns { value, error } where error is null on success.
     */
    decryptDetailed(encryptedData) {
        if (!encryptedData || typeof encryptedData !== 'string') {
            return { value: encryptedData, error: null };
        }
        if (!encryptedData.startsWith('encrypted:')) {
            return { value: encryptedData, error: null };
        }

        if (encryptedData.startsWith('encrypted:v2:')) {
            return this.decryptAuthenticated(encryptedData.substring('encrypted:v2:'.length));
        }

        // Values written before the GCM change: AES-256-CBC, no auth tag.
        return this.decryptLegacy(encryptedData.substring('encrypted:'.length));
    }

    decryptAuthenticated(payloadBase64) {
        try {
            const combined = Buffer.from(payloadBase64, 'base64');
            if (combined.length <= this.gcmIvLength + this.tagLength) {
                return { value: null, error: 'ciphertext is truncated' };
            }

            const iv = combined.subarray(0, this.gcmIvLength);
            const tag = combined.subarray(this.gcmIvLength, this.gcmIvLength + this.tagLength);
            const ciphertext = combined.subarray(this.gcmIvLength + this.tagLength);

            const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
            decipher.setAuthTag(tag);

            const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
            return { value: plaintext, error: null };
        } catch (error) {
            // GCM cannot tell a wrong key from an edited value; both fail the tag
            // check, and pretending otherwise would be worse than saying so.
            const reason = this.keyWasGenerated
                ? 'stored value cannot be decrypted because the master key was missing or regenerated on this start'
                : 'stored value failed its authentication check (edited, corrupted, or encrypted with a different key)';
            console.warn(`[SECURITY] ${reason} (crypto said: ${error.message}) — re-enter the credential`);
            return { value: null, error: reason };
        }
    }

    decryptLegacy(payloadBase64) {
        try {
            const combined = Buffer.from(payloadBase64, 'base64');
            const iv = combined.subarray(0, this.ivLength);
            const ciphertext = combined.subarray(this.ivLength);

            const decipher = crypto.createDecipheriv(this.legacyAlgorithm, this.masterKey, iv);

            let plaintext = decipher.update(ciphertext, null, 'utf8');
            plaintext += decipher.final('utf8');

            console.warn('[SECURITY] Read a value encrypted with the old CBC format; save settings to re-encrypt it with AES-256-GCM');
            return { value: plaintext, error: null };
        } catch (error) {
            const reason = this.keyWasGenerated
                ? 'stored value cannot be decrypted because the master key was missing or regenerated on this start'
                : 'stored value will not decrypt with the current key';
            console.warn(`[SECURITY] ${reason} (crypto said: ${error.message}) — re-enter the credential`);
            return { value: null, error: reason };
        }
    }

    /**
     * Check if a value is encrypted
     */
    isEncrypted(value) {
        return typeof value === 'string' && value.startsWith('encrypted:');
    }

    /**
     * Encrypt all sensitive fields in a settings object
     */
    encryptSettings(settings) {
        const encrypted = { ...settings };
        
        SENSITIVE_FIELDS.forEach(field => {
            if (encrypted[field] && !this.isEncrypted(encrypted[field])) {
                console.log(`[SECURITY] Encrypting field: ${field}`);
                encrypted[field] = this.encrypt(encrypted[field]);
            }
        });
        
        return encrypted;
    }

    /**
     * Decrypt all sensitive fields in a settings object
     */
    decryptSettings(settings) {
        const decrypted = { ...settings };
        
        SENSITIVE_FIELDS.forEach(field => {
            if (decrypted[field] && this.isEncrypted(decrypted[field])) {
                const { value, error } = this.decryptDetailed(decrypted[field]);
                if (error) {
                    console.warn(`[SECURITY] Could not decrypt ${field}: ${error}`);
                }
                decrypted[field] = value;
            }
        });
        
        return decrypted;
    }

    /**
     * Safely log settings without exposing sensitive data
     */
    sanitizeForLogging(settings) {
        const sanitized = { ...settings };
        
        SENSITIVE_FIELDS.forEach(field => {
            if (sanitized[field]) {
                if (this.isEncrypted(sanitized[field])) {
                    sanitized[field] = '[ENCRYPTED]';
                } else {
                    sanitized[field] = '[REDACTED]';
                }
            }
        });
        
        return sanitized;
    }
}

module.exports = CredentialManager;
module.exports.SENSITIVE_FIELDS = SENSITIVE_FIELDS;