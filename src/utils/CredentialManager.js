const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class CredentialManager {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
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
                    return keyData;
                }
            }
            
            // Generate new key if doesn't exist or is invalid
            console.log('[SECURITY] Generating new master encryption key');
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
     * Encrypt sensitive data
     */
    encrypt(plaintext) {
        if (!plaintext || typeof plaintext !== 'string') {
            return plaintext; // Return as-is for empty/non-string values
        }

        try {
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
            
            let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
            ciphertext += cipher.final('hex');
            
            // Combine iv + ciphertext and encode as base64
            const combined = Buffer.concat([iv, Buffer.from(ciphertext, 'hex')]);
            return 'encrypted:' + combined.toString('base64');
            
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

        try {
            // Remove prefix and decode base64
            const combined = Buffer.from(encryptedData.substring(10), 'base64');
            
            // Extract components
            const iv = combined.subarray(0, this.ivLength);
            const ciphertext = combined.subarray(this.ivLength);
            
            const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
            
            let plaintext = decipher.update(ciphertext, null, 'utf8');
            plaintext += decipher.final('utf8');
            
            return plaintext;
            
        } catch (error) {
            console.error('[SECURITY] Decryption error:', error.message);
            console.warn('[SECURITY] Failed to decrypt credential - may be corrupted or using old key');
            return encryptedData; // Return encrypted data rather than failing completely
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
        const sensitiveFields = ['UNIFI_PASSWORD', 'DATABASE_PASSWORD', 'API_KEY', 'SECRET_KEY'];
        const encrypted = { ...settings };
        
        sensitiveFields.forEach(field => {
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
        const sensitiveFields = ['UNIFI_PASSWORD', 'DATABASE_PASSWORD', 'API_KEY', 'SECRET_KEY'];
        const decrypted = { ...settings };
        
        sensitiveFields.forEach(field => {
            if (decrypted[field] && this.isEncrypted(decrypted[field])) {
                decrypted[field] = this.decrypt(decrypted[field]);
            }
        });
        
        return decrypted;
    }

    /**
     * Safely log settings without exposing sensitive data
     */
    sanitizeForLogging(settings) {
        const sensitiveFields = ['UNIFI_PASSWORD', 'DATABASE_PASSWORD', 'API_KEY', 'SECRET_KEY'];
        const sanitized = { ...settings };
        
        sensitiveFields.forEach(field => {
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