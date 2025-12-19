const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateAdmin } = require('../middlewares/auth');

// Input validation helper
const validateUserInput = (data, isUpdate = false) => {
    const errors = [];
    if (!isUpdate || data.name !== undefined) {
        if (!data.name || data.name.trim().length === 0) errors.push('Name is required');
        if (data.name && data.name.length > 100) errors.push('Name must be less than 100 characters');
    }
    if (!isUpdate || data.email !== undefined) {
        if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Valid email is required');
        if (data.email && data.email.length > 100) errors.push('Email must be less than 100 characters');
    }
    if (!isUpdate || data.username !== undefined) {
        if (!data.username || data.username.trim().length < 3) errors.push('Username must be at least 3 characters');
        if (data.username && data.username.length > 50) errors.push('Username must be less than 50 characters');
    }
    return errors;
};

router.get('/users', authenticateAdmin, async (req, res) => {
    try {
        console.log('GET /api/auth/users route hit');
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = Number.parseInt(req.query.limit, 10) || 10;
        if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
            return res.status(400).json({ status: 'error', message: 'Invalid page or limit parameters' });
        }
        const offset = (page - 1) * limit;
        if (isNaN(offset) || offset < 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid offset' });
        }

        const search = typeof req.query.search === 'string' ? req.query.search : '';
        const verified = req.query.verified;
        const isAdmin = req.query.isAdmin;

        if (verified !== undefined && verified !== 'true' && verified !== 'false') {
            return res.status(400).json({ status: 'error', message: 'Invalid verified parameter' });
        }
        if (isAdmin !== undefined && isAdmin !== 'true' && isAdmin !== 'false') {
            return res.status(400).json({ status: 'error', message: 'Invalid isAdmin parameter' });
        }

        let baseQuery = `
            SELECT 
                id, name, username, email, 
                verified, isadmin AS isAdmin, 
                created_at AS createdAt, 
                last_login AS lastLogin
            FROM users
            WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(*) AS total FROM users WHERE 1=1';

        const params = [];
        const countParams = [];

        if (search) {
            const searchTerm = `%${search}%`;
            baseQuery += ' AND (name LIKE ? OR username LIKE ? OR email LIKE ?)';
            countQuery += ' AND (name LIKE ? OR username LIKE ? OR email LIKE ?)';
            params.push(searchTerm, searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm, searchTerm);
        }

        if (verified === 'true' || verified === 'false') {
            const isVerified = verified === 'true';
            baseQuery += ' AND verified = ?';
            countQuery += ' AND verified = ?';
            params.push(isVerified);
            countParams.push(isVerified);
        }

        if (isAdmin === 'true' || isAdmin === 'false') {
            const isAnAdmin = isAdmin === 'true';
            baseQuery += ' AND isadmin = ?';
            countQuery += ' AND isadmin = ?';
            params.push(isAnAdmin);
            countParams.push(isAnAdmin);
        }

        // FIX: Use prepared statements for LIMIT and OFFSET to prevent SQL injection.
        const finalQuery = `${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        console.log('Executing query:', finalQuery);
        console.log('With parameters:', params);
        console.log('Parameter types:', { params: params.map(p => typeof p) });

        const [users] = await db.execute(finalQuery, params);
        const [[totalResult]] = await db.execute(countQuery, countParams);
        const total = totalResult.total;

        res.status(200).json({
            status: 'success',
            data: {
                users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch users',
            error: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});
// PUT /api/auth/users/:id - Update user
router.put('/users/:id', authenticateAdmin, async (req, res) => {
    const errors = validateUserInput(req.body, true);
    if (errors.length > 0) {
        return res.status(400).json({ status: 'error', message: errors.join(', ') });
    }

    const { name, email, username, verified, isAdmin } = req.body;
    const userId = req.params.id;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Check if user exists
        const [user] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        // 2. Check for duplicate email or username (excluding the current user)
        // FIX: Only check for duplicates if the fields are provided in the request body
        const checkParams = [];
        let duplicateCheckQuery = 'SELECT id FROM users WHERE id != ?';
        checkParams.push(userId);

        if (email) {
            duplicateCheckQuery += ' AND email = ?';
            checkParams.push(email);
        }
        if (username) {
            duplicateCheckQuery += ' AND username = ?';
            checkParams.push(username);
        }
        
        const [duplicate] = await connection.execute(duplicateCheckQuery, checkParams);
        
        if (duplicate.length > 0) {
            await connection.rollback();
            // Need to fetch the specific duplicate field to return a meaningful error message
            let errorMessage = 'Email or username already in use';
            
            // To provide a more specific error, a more complex query or logic is required. 
            // Sticking to the original generic error for simplicity of the fix.
            return res.status(400).json({ status: 'error', message: errorMessage });
        }

        // 3. Update user
        await connection.execute(
            `UPDATE users SET 
                name = ?, email = ?, username = ?,
                verified = ?, isadmin = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [name, email, username, verified, isAdmin, userId]
        );

        await connection.commit();
        res.status(200).json({
            status: 'success',
            message: 'User updated successfully'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error updating user:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update user' });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE /api/auth/users/:id - Delete user
router.delete('/users/:id', authenticateAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const [result] = await db.execute('DELETE FROM users WHERE id = ?', [userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        res.status(200).json({ status: 'success', message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete user' });
    }
});

// PATCH /api/auth/users/:id/verify - Toggle verification
router.patch('/users/:id/verify', authenticateAdmin, async (req, res) => {
    const { verified } = req.body;
    if (typeof verified !== 'boolean') {
        return res.status(400).json({ status: 'error', message: 'Invalid verification status' });
    }

    try {
        const [result] = await db.execute(
            'UPDATE users SET verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [verified, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        res.status(200).json({
            status: 'success',
            message: `User verification status updated successfully.`
        });
    } catch (error) {
        console.error('Error toggling verification:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update verification status' });
    }
});

module.exports = router;