// routes/auth/firebaseAuth.js (MODIFIED)
const express = require('express');
const router = express.Router();
const admin = require('../../config/firebaseAdmin');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { createToken, generateAccessToken } = require('../../utils/jwt');
const authenticateToken = require('../../middlewares/auth');

// Utility to find or create user and return JWT
const syncUser = async (user, provider) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        let query, params;
        
        if (provider === 'phone') {
            // For phone auth, check by phone number or firebase_uid
            query = 'SELECT id, username, email, isadmin FROM users WHERE firebase_uid = ? OR phone_number = ?';
            params = [user.uid, user.phone_number];
        } else {
            // For Google/Apple, check by firebase_uid or email
            query = 'SELECT id, username, email, isadmin FROM users WHERE firebase_uid = ?';
            params = [user.uid];
        }

        const [existingUsers] = await connection.execute(query, params);

        let userId;
        let isAdmin = false;

        if (existingUsers.length > 0) {
            // User exists, update last login and details
            userId = existingUsers[0].id;
            isAdmin = existingUsers[0].isadmin;
            
            if (provider === 'phone') {
                await connection.execute(
                    'UPDATE users SET phone_number = ?, last_login = CURRENT_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP() WHERE id = ?',
                    [user.phone_number, userId]
                );
            } else {
                await connection.execute(
                    'UPDATE users SET name = ?, email = ?, photo_url = ?, last_login = CURRENT_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP() WHERE id = ?',
                    [user.name, user.email, user.picture, userId]
                );
            }
        } else {
            // New user, insert
            let username;
            if (provider === 'phone') {
                username = user.phone_number.replace(/\D/g, '');
                const [result] = await connection.execute(
                    'INSERT INTO users (username, phone_number, firebase_uid, verified, last_login) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP())',
                    [username, user.phone_number, user.uid, true]
                );
                userId = result.insertId;
            } else {
                username = user.name?.replace(/\s/g, '') || user.email.split('@')[0];
                const [result] = await connection.execute(
                    'INSERT INTO users (name, username, email, firebase_uid, photo_url, verified, last_login) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP())',
                    [user.name, username, user.email, user.uid, user.picture, user.email_verified]
                );
                userId = result.insertId;
            }
        }

        await connection.commit();

        const token = generateAccessToken(userId, isAdmin);

        return {
            token,
            user_id: userId,
            isAdmin,
            email: user.email || null,
            username: provider === 'phone' ? user.phone_number.replace(/\D/g, '') : (user.name || user.email.split('@')[0]),
            phone: user.phone_number || null,
        };

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// @route   POST /api/auth/firebase/auth/google
// @desc    Authenticate/Register user via Firebase Google ID Token
router.post('/auth/google', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'ID token is required' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const firebaseUser = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            email_verified: decodedToken.email_verified || false,
            name: decodedToken.name,
            picture: decodedToken.picture
        };

        const authData = await syncUser(firebaseUser, 'google');
        res.status(200).json(authData);

    } catch (error) {
        console.error('Google Auth Error:', error.message);
        res.status(401).json({ message: 'Authentication failed', details: error.message });
    }
});

// @route   POST /api/auth/firebase/auth/apple
// @desc    Authenticate/Register user via Firebase Apple ID Token
router.post('/auth/apple', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'ID token is required' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const firebaseUser = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            email_verified: decodedToken.email_verified || false,
            name: decodedToken.name,
            picture: decodedToken.picture
        };

        const authData = await syncUser(firebaseUser, 'apple');
        res.status(200).json(authData);

    } catch (error) {
        console.error('Apple Auth Error:', error.message);
        res.status(401).json({ message: 'Authentication failed', details: error.message });
    }
});

// @route   POST /api/auth/firebase/auth/phone
// @desc    Authenticate/Register user via Firebase Phone ID Token
router.post('/auth/phone', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'ID token is required' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const firebaseUser = {
            uid: decodedToken.uid,
            phone_number: decodedToken.phone_number,
            phone_number_verified: true
        };

        const authData = await syncUser(firebaseUser, 'phone');
        res.status(200).json(authData);

    } catch (error) {
        console.error('Phone Auth Error:', error.message);
        res.status(401).json({ message: 'Authentication failed', details: error.message });
    }
});

module.exports = router;