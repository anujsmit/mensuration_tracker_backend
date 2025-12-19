// routes/auth/phoneAuth.js
const express = require('express');
const router = express.Router();
const admin = require('../../config/firebaseAdmin');
const db = require('../../config/db');
const { generateAccessToken } = require('../../utils/jwt');

router.post('/verify-token', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'ID token is required' });
    }

    console.log('Received phone auth request with ID token:', idToken.substring(0, 20) + '...');

    try {
        // 1. Verify the Firebase ID token
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        console.log('Decoded token UID:', decodedToken.uid);

        const userRecord = await admin.auth().getUser(decodedToken.uid);
        
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            // 2. Check if user exists by phone number or firebase_uid
            const [existingUsers] = await connection.execute(
                'SELECT id, username, email, isadmin FROM users WHERE firebase_uid = ? OR phone_number = ?',
                [userRecord.uid, userRecord.phoneNumber]
            );

            let userId;
            let isAdmin = false; // Default for new users

            if (existingUsers.length > 0) {
                // User exists - extract ID and convert isadmin (0/1) to boolean (true/false)
                userId = existingUsers[0].id;
                isAdmin = !!existingUsers[0].isadmin; 
                
                await connection.execute(
                    'UPDATE users SET phone_number = ?, firebase_uid = ?, last_login = CURRENT_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP() WHERE id = ?',
                    [userRecord.phoneNumber, userRecord.uid, userId]
                );
            } else {
                // New user - insert into database
                const username = userRecord.phoneNumber ? 
                    userRecord.phoneNumber.replace(/\D/g, '') : 
                    `user_${Date.now()}`;
                    
                const [result] = await connection.execute(
                    'INSERT INTO users (username, phone_number, firebase_uid, verified, last_login) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP())',
                    [username, userRecord.phoneNumber, userRecord.uid, true]
                );
                userId = result.insertId;
            }

            await connection.commit();

            // 3. Generate internal JWT for the app
            const token = generateAccessToken(userId, isAdmin);

            // 4. Send successful response with boolean isAdmin
            res.status(200).json({
                token,
                user_id: userId,
                isAdmin: isAdmin, 
                email: null,
                username: userRecord.phoneNumber ? userRecord.phoneNumber.replace(/\D/g, '') : `user_${userId}`,
                phone: userRecord.phoneNumber
            });

        } catch (dbError) {
            if (connection) await connection.rollback();
            console.error('Database error:', dbError);
            throw dbError;
        } finally {
            if (connection) connection.release();
        }

    } catch (error) {
        console.error('Phone Auth Error:', error.message);
        res.status(401).json({ 
            message: 'Authentication failed', 
            details: error.message,
            code: error.code
        });
    }
});

module.exports = router;