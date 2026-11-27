const axios = require('axios');
const https = require('https');
const {
    DAY_NAMES,
    parseTimeToMinutes,
    isMinuteInWindow,
    getZonedParts,
    resolveDefaultTimeZone,
} = require('../utils/scheduleWindow');

class ParentalControlsManager {
    constructor(unifiController, databaseManager) {
        this.unifiController = unifiController;
        this.db = databaseManager;
        this.blockedDevices = new Set(); // Cache of currently blocked devices
        this.scheduleCheckInterval = null;
        this.bonusTimeTimers = new Map(); // Track active bonus time sessions: mac -> {timer, endTime, originallyBlocked}
        this.timeZone = resolveDefaultTimeZone();
        
        // Start background processes
        this.startScheduleChecker();
        this.startDailyReset();
    }

    // Get all devices from UniFi controller for parental control selection
    async getAvailableDevices() {
        try {
            // Check if UniFi controller is configured
            if (!this.unifiController.isConfigured()) {
                throw new Error('UniFi controller not configured. Please configure your UniFi controller in settings to add devices.');
            }

            const allDevices = await this.unifiController.getAllClientDevices();
            const managedDevices = await this.db.getManagedDevices();
            const managedMacs = new Set(managedDevices.map(d => d.mac));

            return allDevices.map(device => ({
                ...device,
                isManaged: managedMacs.has(device.mac)
            }));
        } catch (error) {
            console.error('Error getting available devices:', error);
            throw error;
        }
    }

    // Add device to parental controls
    async addDeviceToParentalControls(deviceData) {
        try {
            await this.db.addManagedDevice(deviceData);
            return { success: true, message: 'Device added to parental controls' };
        } catch (error) {
            console.error('Error adding device to parental controls:', error);
            throw error;
        }
    }

    // Remove device from parental controls
    async removeDeviceFromParentalControls(mac) {
        try {
            // Unblock device first if it's blocked
            await this.unblockDevice(mac, 'removed_from_management');
            await this.db.removeManagedDevice(mac);
            return { success: true, message: 'Device removed from parental controls' };
        } catch (error) {
            console.error('Error removing device from parental controls:', error);
            throw error;
        }
    }

    // Block device on UniFi controller
    async blockDevice(mac, reason = 'manual', duration = null) {
        try {
            const success = await this.retryUnifiOperation(
                () => this.unifiController.blockDevice(mac),
                `Block device ${mac}`
            );
            
            if (success) {
                this.blockedDevices.add(mac);
                await this.db.updateDeviceBlockStatus(mac, true, reason, duration);
                return { success: true, message: 'Device blocked successfully' };
            } else {
                throw new Error('Failed to block device on UniFi controller');
            }
        } catch (error) {
            console.error('Error blocking device:', error);
            throw error;
        }
    }

    // Unblock device on UniFi controller
    async unblockDevice(mac, reason = 'manual') {
        try {
            const success = await this.retryUnifiOperation(
                () => this.unifiController.unblockDevice(mac),
                `Unblock device ${mac}`
            );
            
            if (success) {
                this.blockedDevices.delete(mac);
                await this.db.updateDeviceBlockStatus(mac, false, reason);
                return { success: true, message: 'Device unblocked successfully' };
            } else {
                throw new Error('Failed to unblock device on UniFi controller');
            }
        } catch (error) {
            console.error('Error unblocking device:', error);
            throw error;
        }
    }

    // The only place schedule/bonus enforcement touches the device. It talks
    // straight to the controller and never persists is_blocked (that stays user
    // intent, written only by the block/unblock endpoints); the controller is
    // the source of truth for block state. Errors propagate to the caller.
    async applyControllerBlock(mac, shouldBlock, reason) {
        const success = await this.retryUnifiOperation(
            () => shouldBlock ? this.unifiController.blockDevice(mac) : this.unifiController.unblockDevice(mac),
            shouldBlock ? `Block device ${mac}` : `Unblock device ${mac}`
        );
        if (!success) {
            throw new Error(`Failed to ${shouldBlock ? 'block' : 'unblock'} device on UniFi controller`);
        }
        if (shouldBlock) {
            this.blockedDevices.add(mac);
        } else {
            this.blockedDevices.delete(mac);
        }
        await this.db.logParentalAction(mac, shouldBlock ? 'blocked' : 'unblocked', reason);
    }

    // Set time limits for device
    async setTimeLimit(mac, dailyTimeLimit, bonusTime = 0) {
        try {
            await this.db.updateDeviceTimeLimit(mac, dailyTimeLimit, bonusTime);
            return { success: true, message: 'Time limits updated successfully' };
        } catch (error) {
            console.error('Error setting time limit:', error);
            throw error;
        }
    }

    // Add bonus time to device - unblocks device and sets timer for auto re-blocking
    async addBonusTime(mac, bonusMinutes) {
        try {
            if (!bonusMinutes || bonusMinutes <= 0) {
                throw new Error('Bonus time must be a positive number');
            }

            // Get current device settings
            const device = await this.db.getManagedDevice(mac);
            if (!device) {
                throw new Error('Device not found in parental controls');
            }

            // Check if device is currently blocked to know if we should re-block later
            const isCurrentlyBlocked = await this.isDeviceBlocked(mac);
            
            // Clear any existing bonus time timer for this device
            if (this.bonusTimeTimers.has(mac)) {
                clearTimeout(this.bonusTimeTimers.get(mac).timer);
                console.log(`Cleared existing bonus time for device ${mac}`);
            }

            // Calculate end time
            const endTime = new Date(Date.now() + (bonusMinutes * 60 * 1000));
            
            // Unblock the device immediately
            console.log(`🎁 Starting ${bonusMinutes}-minute bonus time for device ${mac}`);
            if (isCurrentlyBlocked || await this.shouldDeviceBeBlockedNow(mac)) {
                await this.unblockDevice(mac);
                console.log(`📱 Device ${mac} unblocked for bonus time`);
            }

            // Set timer to re-block device when bonus time expires
            const timer = setTimeout(async () => {
                try {
                    console.log(`⏰ Bonus time expired for device ${mac}`);
                    
                    // Remove from active timers
                    this.bonusTimeTimers.delete(mac);
                    
                    // Re-block device if it should be blocked based on schedule/rules
                    const shouldBeBlocked = await this.shouldDeviceBeBlockedNow(mac);
                    if (shouldBeBlocked) {
                        await this.applyControllerBlock(mac, true, 'temporary');
                        console.log(`🚫 Device ${mac} re-blocked after bonus time expired`);
                    } else {
                        console.log(`✅ Device ${mac} remains unblocked - not scheduled to be blocked`);
                    }
                } catch (error) {
                    console.error(`Error handling bonus time expiration for ${mac}:`, error);
                }
            }, bonusMinutes * 60 * 1000);

            // Store timer info
            this.bonusTimeTimers.set(mac, {
                timer,
                endTime,
                bonusMinutes,
                startTime: new Date(),
                originallyBlocked: isCurrentlyBlocked
            });

            console.log(`⏱️  Bonus time timer set for device ${mac} - expires at ${endTime.toLocaleTimeString()}`);
            
            return { 
                success: true, 
                message: `Added ${bonusMinutes} minutes of bonus time`,
                bonusTime: bonusMinutes,
                endTime: endTime.toISOString(),
                isActive: true
            };
        } catch (error) {
            console.error('Error adding bonus time:', error);
            throw error;
        }
    }

    // Get remaining bonus time for a device
    getBonusTimeStatus(mac) {
        if (!this.bonusTimeTimers.has(mac)) {
            return { isActive: false, remainingMinutes: 0, endTime: null };
        }

        const timerInfo = this.bonusTimeTimers.get(mac);
        const now = new Date();
        const remainingMs = timerInfo.endTime.getTime() - now.getTime();
        const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));

        return {
            isActive: remainingMinutes > 0,
            remainingMinutes,
            endTime: timerInfo.endTime.toISOString(),
            totalBonusMinutes: timerInfo.bonusMinutes,
            startTime: timerInfo.startTime.toISOString()
        };
    }

    // Cancel active bonus time for a device
    async cancelBonusTime(mac) {
        if (!this.bonusTimeTimers.has(mac)) {
            return { success: false, message: 'No active bonus time for this device' };
        }

        const timerInfo = this.bonusTimeTimers.get(mac);
        clearTimeout(timerInfo.timer);
        this.bonusTimeTimers.delete(mac);

        // Re-block device if it should be blocked
        const shouldBeBlocked = await this.shouldDeviceBeBlockedNow(mac);
        if (shouldBeBlocked) {
            await this.blockDevice(mac);
            console.log(`🚫 Device ${mac} re-blocked after bonus time was cancelled`);
        }

        console.log(`❌ Bonus time cancelled for device ${mac}`);
        return { success: true, message: 'Bonus time cancelled' };
    }

    // Set schedule for device
    async setSchedule(mac, scheduleData) {
        try {
            await this.db.updateDeviceSchedule(mac, scheduleData);
            return { success: true, message: 'Schedule updated successfully' };
        } catch (error) {
            console.error('Error setting schedule:', error);
            throw error;
        }
    }

    // Get current status of all managed devices
    async getManagedDevicesStatus() {
        try {
            console.log('ParentalControlsManager: Getting managed devices from database...');
            const managedDevices = await this.db.getManagedDevices();
            console.log(`ParentalControlsManager: Found ${managedDevices.length} managed devices in database`);
            
            // Try to get current device data and blocked devices from UniFi controller
            let currentDevices = new Set();
            let blockedDevices = new Set();
            // Only non-zero when the controller actually answered: an unconfigured
            // controller or a failed fetch means "unknown", not "nothing is blocked".
            let hasControllerState = false;
            
            try {
                if (this.unifiController.isConfigured()) {
                    console.log('ParentalControlsManager: UniFi controller is configured, fetching current devices and block status...');
                    
                    // Get both current devices and blocked devices from UniFi.
                    // The blocked list is fetched in strict mode: it must not be
                    // mistaken for "nothing is blocked" just because the call
                    // failed, or the reconcile below would clear real manual blocks.
                    const [currentDevicesData, blockedDevicesData] = await Promise.all([
                        this.unifiController.getAllKnownDevices(),
                        this.unifiController.getBlockedDevices({ strict: true })
                    ]);
                    
                    // Convert devices array to Set of MAC addresses for fast lookup
                    currentDevices = new Set(currentDevicesData.map(device => device.mac.toLowerCase()));
                    console.log(`ParentalControlsManager: Got ${currentDevices.size} current devices from UniFi`);
                    
                    // Convert blocked devices array to Set of MAC addresses
                    blockedDevices = new Set(blockedDevicesData.map(device => device.mac.toLowerCase()));
                    console.log(`ParentalControlsManager: Got ${blockedDevices.size} blocked devices from UniFi`);
                    
                    // Update our internal blocked devices cache
                    this.blockedDevices = new Set(blockedDevices);
                    hasControllerState = true;
                } else {
                    console.log('ParentalControlsManager: UniFi controller not configured, using stored data only');
                }
            } catch (error) {
                console.warn('Could not fetch current device data from UniFi controller:', error.message);
                // Continue without current device data
            }
            
            // Downward-only reconcile: clear a manual flag the controller no
            // longer honours, but never write is_blocked = 1 just because the
            // controller shows a block (that would manufacture a manual block
            // from a schedule block). No parental_logs row is written here.
            if (hasControllerState) {
                for (const device of managedDevices) {
                    const deviceMac = device.mac.toLowerCase();
                    if (!blockedDevices.has(deviceMac) && device.is_blocked) {
                        await this.db.updateDeviceBlockStatus(deviceMac, false, 'sync_with_unifi', null, { log: false });
                    }
                }
            }

            return managedDevices.map(device => {
                const deviceMac = device.mac.toLowerCase();
                
                // Check if device MAC is in the current devices Set (device is online)
                const isOnline = currentDevices.has(deviceMac);
                
                // Check actual block status from UniFi controller
                const isActuallyBlocked = blockedDevices.has(deviceMac);
                
                const scheduleData = device.schedule_data ? JSON.parse(device.schedule_data) : null;
                
                const bonusTimeStatus = this.getBonusTimeStatus(device.mac);
                
                return {
                    ...device,
                    is_blocked: isActuallyBlocked, // Use actual UniFi status
                    isOnline: isOnline,
                    currentIp: device.ip, // Use stored IP since getAllKnownDevices only returns MAC addresses
                    lastSeen: isOnline ? new Date().toISOString() : null,
                    schedule: scheduleData,
                    shouldBeBlocked: this.shouldDeviceBeBlocked({ ...device, is_blocked: isActuallyBlocked }, scheduleData),
                    bonusTime: bonusTimeStatus
                };
            });
        } catch (error) {
            console.error('Error getting managed devices status:', error);
            throw error;
        }
    }

    // Check if device should be blocked based on schedule (removed time limits - not realistic)
    shouldDeviceBeBlocked(device, scheduleData) {
        const now = new Date();
        
        // A persisted block (user/manual intent) wins over the schedule so a
        // manually blocked device is never auto-unblocked the moment its window
        // closes.
        if (device.is_blocked) return true;
        
        // Check if temporarily blocked
        if (device.blocked_until) {
            const blockedUntil = new Date(device.blocked_until);
            if (now < blockedUntil) return true;
        }
        
        // Check schedule
        if (device.is_scheduled && scheduleData) {
            return this.isBlockedBySchedule(scheduleData, now);
        }
        
        return false;
    }

    // Helper method to retry UniFi operations with re-authentication on 401 errors
    async retryUnifiOperation(operation, operationName, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                return result;
            } catch (error) {
                console.log(`${operationName} attempt ${attempt} failed:`, error.message);
                
                // If it's a 401 error and we have retries left, try to re-authenticate
                if (error.message.includes('401') && attempt < maxRetries) {
                    console.log(`🔄 401 error detected, attempting to re-authenticate (attempt ${attempt}/${maxRetries})`);
                    try {
                        // Force a new login by clearing any cached session
                        await this.unifiController.logout();
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                        
                        // The next operation will automatically trigger a new login
                        continue;
                    } catch (authError) {
                        console.error('Re-authentication failed:', authError.message);
                    }
                } else if (attempt === maxRetries) {
                    // Last attempt failed, throw the error
                    throw error;
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
        }
    }

    // Check if device is currently blocked in UniFi
    async isDeviceBlocked(mac) {
        try {
            if (!this.unifiController.isConfigured()) {
                return false;
            }
            
            const result = await this.retryUnifiOperation(
                () => this.unifiController.getBlockedUsers(),
                `Check if device ${mac} is blocked`
            );
            
            return result.some(user => user.mac === mac.toLowerCase());
        } catch (error) {
            console.error(`Error checking if device ${mac} is blocked:`, error);
            return false;
        }
    }

    // Check if device should be blocked right now based on current rules
    async shouldDeviceBeBlockedNow(mac) {
        try {
            const device = await this.db.getManagedDevice(mac);
            if (!device) return false;

            const scheduleData = device.schedule_data ? JSON.parse(device.schedule_data) : null;
            return this.shouldDeviceBeBlocked(device, scheduleData);
        } catch (error) {
            console.error(`Error checking if device ${mac} should be blocked:`, error);
            return false;
        }
    }

    // Check if current time falls within blocked schedule. Times are compared as
    // minute-of-day integers, and a window where start > end spans midnight
    // (inclusive at both ends). Evaluated in the configured timeZone.
    isBlockedBySchedule(scheduleData, now = new Date(), timeZone = this.timeZone) {
        if (!scheduleData) return false;

        const { dayIndex, minuteOfDay } = getZonedParts(now, timeZone);
        const today = DAY_NAMES[dayIndex];
        const yesterday = DAY_NAMES[(dayIndex + 6) % 7];

        const todaySchedule = scheduleData[today];
        if (todaySchedule) {
            for (const period of todaySchedule.blockedPeriods || []) {
                const start = parseTimeToMinutes(period.start);
                const end = parseTimeToMinutes(period.end);
                if (start == null || end == null) continue;
                if (isMinuteInWindow(minuteOfDay, start, end)) return true;
            }
        }

        // Carry-over: a previous day's overnight window (start > end) also covers
        // the early-morning hours of the current day (e.g. Monday 22:00-08:00
        // covers Tuesday 07:30). Per-day schedule shape is unchanged.
        const yesterdaySchedule = scheduleData[yesterday];
        if (yesterdaySchedule) {
            for (const period of yesterdaySchedule.blockedPeriods || []) {
                const start = parseTimeToMinutes(period.start);
                const end = parseTimeToMinutes(period.end);
                if (start == null || end == null) continue;
                if (start > end && minuteOfDay <= end) return true;
            }
        }

        return false;
    }

    // Background process to check schedules and enforce rules
    startScheduleChecker() {
        // Check every minute
        this.scheduleCheckInterval = setInterval(async () => {
            try {
                await this.enforceParentalRules();
            } catch (error) {
                console.error('Error in schedule checker:', error);
            }
        }, 60000);
    }

    // Enforce parental control rules. One pass: current block state is fetched
    // fresh from the controller once per pass, so a device whose window ends is
    // unblocked even if the Parental Controls tab was never opened. A device
    // already blocked is never re-blocked, and no is_blocked / parental_logs
    // writes happen here (the controller wins).
    async enforceParentalRules() {
        try {
            if (!this.unifiController.isConfigured()) return;

            let blocked;
            try {
                blocked = await this.unifiController.getBlockedDevices({ strict: true });
            } catch (error) {
                console.warn('Schedule enforcement skipped: could not determine controller block state:', error.message);
                return;
            }
            const currentlyBlocked = new Set(blocked.map((d) => String(d.mac).toLowerCase()));
            this.blockedDevices = new Set(currentlyBlocked);

            const managedDevices = await this.db.getManagedDevices();
            for (const device of managedDevices) {
                const mac = String(device.mac);
                // An active bonus session owns the device; don't re-block it a
                // minute after the user granted time.
                if (this.bonusTimeTimers.has(mac)) continue;

                const macLower = mac.toLowerCase();
                const scheduleData = device.schedule_data ? JSON.parse(device.schedule_data) : null;
                const desired = this.shouldDeviceBeBlocked(device, scheduleData);
                const actual = currentlyBlocked.has(macLower);

                try {
                    if (desired && !actual) {
                        await this.applyControllerBlock(mac, true, 'schedule');
                    } else if (!desired && actual) {
                        await this.applyControllerBlock(mac, false, 'schedule');
                    }
                } catch (error) {
                    console.error(`Schedule enforcement failed for device ${mac}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error enforcing parental rules:', error);
        }
    }

    // Reset daily time usage at midnight
    startDailyReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const msUntilMidnight = tomorrow.getTime() - now.getTime();
        
        // Initial reset at midnight
        setTimeout(() => {
            this.db.resetDailyTimeUsage();
            
            // Then reset every 24 hours
            setInterval(() => {
                this.db.resetDailyTimeUsage();
            }, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
    }

    // Cleanup intervals and timers
    destroy() {
        if (this.scheduleCheckInterval) {
            clearInterval(this.scheduleCheckInterval);
        }
        
        // Clear all bonus time timers
        for (const [mac, timerInfo] of this.bonusTimeTimers) {
            clearTimeout(timerInfo.timer);
            console.log(`Cleared bonus time timer for device ${mac}`);
        }
        this.bonusTimeTimers.clear();
    }
}

module.exports = ParentalControlsManager;