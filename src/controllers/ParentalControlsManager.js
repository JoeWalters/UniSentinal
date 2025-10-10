const axios = require('axios');
const https = require('https');

class ParentalControlsManager {
    constructor(unifiController, databaseManager) {
        this.unifiController = unifiController;
        this.db = databaseManager;
        this.blockedDevices = new Set(); // Cache of currently blocked devices
        this.scheduleCheckInterval = null;
        
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
            const success = await this.unifiController.blockDevice(mac);
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
            const success = await this.unifiController.unblockDevice(mac);
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
            
            try {
                if (this.unifiController.isConfigured()) {
                    console.log('ParentalControlsManager: UniFi controller is configured, fetching current devices and block status...');
                    
                    // Get both current devices and blocked devices from UniFi
                    const [currentDevicesData, blockedDevicesData] = await Promise.all([
                        this.unifiController.getAllKnownDevices(),
                        this.unifiController.getBlockedDevices()
                    ]);
                    
                    currentDevices = currentDevicesData;
                    console.log(`ParentalControlsManager: Got ${currentDevices.size} current devices from UniFi`);
                    
                    // Convert blocked devices array to Set of MAC addresses
                    blockedDevices = new Set(blockedDevicesData.map(device => device.mac.toLowerCase()));
                    console.log(`ParentalControlsManager: Got ${blockedDevices.size} blocked devices from UniFi`);
                    
                    // Update our internal blocked devices cache
                    this.blockedDevices = new Set(blockedDevices);
                } else {
                    console.log('ParentalControlsManager: UniFi controller not configured, using stored data only');
                }
            } catch (error) {
                console.warn('Could not fetch current device data from UniFi controller:', error.message);
                // Continue without current device data
            }
            
            return managedDevices.map(device => {
                const deviceMac = device.mac.toLowerCase();
                
                // Check if device MAC is in the current devices Set (device is online)
                const isOnline = currentDevices.has(deviceMac);
                
                // Check actual block status from UniFi controller
                const isActuallyBlocked = blockedDevices.has(deviceMac);
                
                // Update database if there's a mismatch between UniFi and our database
                if (isActuallyBlocked !== device.is_blocked) {
                    console.log(`Status mismatch for ${device.device_name} (${deviceMac}): DB=${device.is_blocked}, UniFi=${isActuallyBlocked}. Updating database...`);
                    this.db.updateDeviceBlockStatus(deviceMac, isActuallyBlocked, 'sync_with_unifi');
                }
                
                const scheduleData = device.schedule_data ? JSON.parse(device.schedule_data) : null;
                
                return {
                    ...device,
                    is_blocked: isActuallyBlocked, // Use actual UniFi status
                    isOnline: isOnline,
                    currentIp: device.ip, // Use stored IP since getAllKnownDevices only returns MAC addresses
                    lastSeen: isOnline ? new Date().toISOString() : null,
                    schedule: scheduleData,
                    timeRemaining: this.calculateTimeRemaining(device),
                    shouldBeBlocked: this.shouldDeviceBeBlocked({ ...device, is_blocked: isActuallyBlocked }, scheduleData)
                };
            });
        } catch (error) {
            console.error('Error getting managed devices status:', error);
            throw error;
        }
    }

    // Calculate remaining time for device today
    calculateTimeRemaining(device) {
        if (device.daily_time_limit === 0) return null; // No limit
        
        const totalAvailable = device.daily_time_limit + device.bonus_time;
        const remaining = totalAvailable - device.time_used_today;
        
        return Math.max(0, remaining);
    }

    // Check if device should be blocked based on schedule and time limits
    shouldDeviceBeBlocked(device, scheduleData) {
        const now = new Date();
        
        // Check if temporarily blocked
        if (device.blocked_until) {
            const blockedUntil = new Date(device.blocked_until);
            if (now < blockedUntil) return true;
        }
        
        // Check time limits
        if (device.daily_time_limit > 0) {
            const timeRemaining = this.calculateTimeRemaining(device);
            if (timeRemaining <= 0) return true;
        }
        
        // Check schedule
        if (device.is_scheduled && scheduleData) {
            return this.isBlockedBySchedule(scheduleData, now);
        }
        
        return device.is_blocked;
    }

    // Check if current time falls within blocked schedule
    isBlockedBySchedule(scheduleData, now = new Date()) {
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const timeString = now.toTimeString().substring(0, 5); // "HH:MM"
        
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];
        
        if (!scheduleData[dayName]) return false;
        
        const daySchedule = scheduleData[dayName];
        
        // Check if current time falls within any blocked period
        for (const period of daySchedule.blockedPeriods || []) {
            if (timeString >= period.start && timeString <= period.end) {
                return true;
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

    // Enforce parental control rules
    async enforceParentalRules() {
        try {
            const managedDevices = await this.db.getManagedDevices();
            
            for (const device of managedDevices) {
                const scheduleData = device.schedule_data ? JSON.parse(device.schedule_data) : null;
                const shouldBeBlocked = this.shouldDeviceBeBlocked(device, scheduleData);
                const isCurrentlyBlocked = this.blockedDevices.has(device.mac);
                
                if (shouldBeBlocked && !isCurrentlyBlocked) {
                    await this.blockDevice(device.mac, 'schedule', null);
                } else if (!shouldBeBlocked && isCurrentlyBlocked && !device.is_blocked) {
                    // Only unblock if not manually blocked
                    await this.unblockDevice(device.mac, 'schedule');
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

    // Cleanup intervals
    destroy() {
        if (this.scheduleCheckInterval) {
            clearInterval(this.scheduleCheckInterval);
        }
    }
}

module.exports = ParentalControlsManager;