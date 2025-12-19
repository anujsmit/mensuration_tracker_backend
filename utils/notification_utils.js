const db = require('../../config/db');
const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');

async function createPeriodAlertNotification(userId) {
    try {
        const [profile] = await db.execute(
            `SELECT last_period_date, cycle_length 
             FROM profile WHERE user_id = ?`, 
            [userId]
        );
        
        if (profile.length === 0) return null;
        
        const lastPeriod = profile[0].last_period_date;
        const cycleLength = profile[0].cycle_length || 28;
        
        if (!lastPeriod) return null;
        
        const nextPeriod = moment(lastPeriod).add(cycleLength, 'days');
        const daysUntil = nextPeriod.diff(moment(), 'days');
        
        if (daysUntil >= 0 && daysUntil <= 3) {
            const message = daysUntil === 0 
                ? "Your period is expected today! Make sure you're prepared."
                : `Your period is coming in ${daysUntil} day(s). Consider preparing necessary items.`;
            
            await db.execute(
                `INSERT INTO notifications (type_id, title, message, created_at)
                 VALUES (4, 'Period Alert', ?, NOW())`, 
                [message]
            );
            
            const [notification] = await db.execute('SELECT LAST_INSERT_ID() as id');
            await db.execute(
                'INSERT INTO user_notifications (user_id, notification_id) VALUES (?, ?)',
                [userId, notification[0].id]
            );
            
            return message;
        }
        return null;
    } catch (error) {
        console.error('Error creating period alert:', error);
        return null;
    }
}

async function createLoginNotification(userId) {
    try {
        await db.execute(
            `INSERT INTO notifications (type_id, title, message, created_at)
             VALUES (4, 'Login Alert', 'Your account was accessed just now.', NOW())`
        );
        
        const [notification] = await db.execute('SELECT LAST_INSERT_ID() as id');
        await db.execute(
            'INSERT INTO user_notifications (user_id, notification_id) VALUES (?, ?)',
            [userId, notification[0].id]
        );
    } catch (error) {
        console.error('Error creating login notification:', error);
    }
}

module.exports = {
    createPeriodAlertNotification,
    createLoginNotification
};