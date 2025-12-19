const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateUser, authenticateAdmin } = require('../middlewares/auth');
const moment = require('moment-timezone');

moment.tz.setDefault('Asia/Kolkata');

// Input validation helper
const validateNotificationInput = (data) => {
    const errors = [];
    if (!data.title || data.title.trim().length === 0) errors.push('Title is required');
    if (!data.message || data.message.trim().length === 0) errors.push('Message is required');
    if (data.typeId && isNaN(data.typeId)) errors.push('Invalid notification type');
    return errors;
};

// Get paginated notifications
router.get('/', authenticateUser, async (req, res) => {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    try {
        let baseQuery = `
            SELECT 
                n.id, 
                n.title, 
                n.message, 
                n.created_at,
                nt.name AS type_name,
                nt.icon_name,
                nt.color_code,
                un.is_read,
                un.read_at,
                u.name AS sender_name
            FROM notifications n
            JOIN notification_types nt ON n.type_id = nt.id
            JOIN user_notifications un ON n.id = un.notification_id
            LEFT JOIN users u ON n.sender_id = u.id
            WHERE un.user_id = ?
        `;

        const queryParams = [req.user.userId];

        if (req.query.isRead !== undefined) {
            baseQuery += ' AND un.is_read = ?';
            queryParams.push(req.query.isRead === 'true');
        }

        baseQuery += ` ORDER BY n.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [notifications] = await db.execute(baseQuery, queryParams);
        const [countResult] = await db.execute(
            'SELECT COUNT(*) AS total FROM user_notifications WHERE user_id = ?',
            [req.user.userId]
        );
        const [unreadResult] = await db.execute(
            'SELECT COUNT(*) AS unread_count FROM user_notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.userId]
        );

        res.status(200).json({
            status: 'success',
            data: {
                notifications,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(countResult[0].total / limit),
                    totalItems: countResult[0].total,
                    itemsPerPage: limit
                },
                unread_count: unreadResult[0].unread_count
            }
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while fetching notifications',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Mark notifications as read
router.post('/mark-read', authenticateUser, async (req, res) => {
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'notificationIds must be an array.' 
        });
    }

    try {
        if (notificationIds.length === 0) {
            await db.execute('CALL mark_all_notifications_read(?)', [req.user.userId]);
        } else {
            await db.execute('CALL mark_notifications_read(?, ?)', 
                [req.user.userId, notificationIds.join(',')]);
        }

        const [unreadResult] = await db.execute(
            'SELECT COUNT(*) AS unread_count FROM user_notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.userId]
        );

        res.status(200).json({ 
            status: 'success', 
            message: 'Notifications marked as read',
            unread_count: unreadResult[0].unread_count
        });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while marking notifications as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Admin send to all users
router.post('/admin/send-to-all', authenticateAdmin, async (req, res) => {
    const { title, message, typeId } = req.body;
    const errors = validateNotificationInput(req.body);
    
    if (errors.length > 0) {
        return res.status(400).json({ status: 'error', message: errors.join(', ') });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get all active user IDs
        const [users] = await connection.execute(
            'SELECT id FROM users WHERE verified = TRUE'
        );

        if (users.length === 0) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'No active users found to send notification to' 
            });
        }

        const userIds = users.map(user => user.id);

        // Create notification
        const [notificationResult] = await connection.execute(
            'INSERT INTO notifications (type_id, sender_id, title, message) VALUES (?, ?, ?, ?)',
            [typeId || 3, req.user.userId, title, message]
        );

        // Create user notifications
        const userNotificationValues = userIds.map(userId => [userId, notificationResult.insertId]);
        await connection.query(
            'INSERT INTO user_notifications (user_id, notification_id) VALUES ?',
            [userNotificationValues]
        );

        await connection.commit();
        res.status(201).json({ 
            status: 'success', 
            message: `Notification sent successfully to ${userIds.length} user(s).`,
            notification_id: notificationResult.insertId
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error sending notification to all users:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while sending notification to all users',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
});

// Admin send to specific users
router.post('/admin/send', authenticateAdmin, async (req, res) => {
    const { userIds, title, message, typeId } = req.body;
    const errors = validateNotificationInput(req.body);
    
    if (errors.length > 0) {
        return res.status(400).json({ status: 'error', message: errors.join(', ') });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'At least one user ID in an array is required' 
        });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [notificationResult] = await connection.execute(
            'INSERT INTO notifications (type_id, sender_id, title, message) VALUES (?, ?, ?, ?)',
            [typeId || 3, req.user.userId, title, message]
        );

        const userNotificationValues = userIds.map(userId => [userId, notificationResult.insertId]);
        await connection.query(
            'INSERT INTO user_notifications (user_id, notification_id) VALUES ?',
            [userNotificationValues]
        );

        await connection.commit();
        res.status(201).json({ 
            status: 'success', 
            message: `Notification sent successfully to ${userIds.length} user(s).`,
            notification_id: notificationResult.insertId
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error sending notification:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while sending notification',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;