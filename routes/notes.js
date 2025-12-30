const express = require('express');
const router = express.Router();
const db = require('../config/db');
const moment = require('moment');
const { authenticateUser } = require('../middlewares/auth');

// Helper function to convert undefined to null
const sanitizeData = (data) => {
    if (data === undefined) return null;
    if (typeof data === 'string' && data.trim() === '') return null;
    return data;
};

// @route   GET /api/auth/notes
router.get('/', authenticateUser, async (req, res) => {
    const { date } = req.query;
    
    if (!date) {
        return res.status(400).json({ status: 'error', message: 'Date is required' });
    }
    
    try {
        const formattedDate = moment(date).format('YYYY-MM-DD');
        
        const [notes] = await db.execute(
            `SELECT 
                id, 
                user_id, 
                note_date, 
                content, 
                mood,
                is_period_day,
                pads_used,
                period_intensity,
                period_notes,
                created_at,
                updated_at
             FROM daily_notes 
             WHERE user_id = ? AND note_date = ?`,
            [req.user.userId, formattedDate]
        );

        res.status(200).json({
            status: 'success',
            data: notes
        });
    } catch (error) {
        console.error('Notes fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   POST /api/auth/notes
router.post('/', authenticateUser, async (req, res) => {
    const { 
        date, 
        content, 
        mood,
        isPeriodDay = false,
        padsUsed = 0,
        periodIntensity = 'medium',
        periodNotes
    } = req.body;

    if (!date) {
        return res.status(400).json({ status: 'error', message: 'Date is required' });
    }

    // Validate inputs
    if (isPeriodDay && padsUsed < 0) {
        return res.status(400).json({ status: 'error', message: 'Pads used must be 0 or more' });
    }

    const validIntensities = ['light', 'medium', 'heavy'];
    if (periodIntensity && !validIntensities.includes(periodIntensity)) {
        return res.status(400).json({ status: 'error', message: 'Invalid period intensity' });
    }

    try {
        const formattedDate = moment(date).format('YYYY-MM-DD');

        // Sanitize all data
        const sanitizedContent = sanitizeData(content);
        const sanitizedMood = sanitizeData(mood);
        const sanitizedPeriodIntensity = isPeriodDay ? periodIntensity : null;
        const sanitizedPeriodNotes = sanitizeData(periodNotes);
        const sanitizedPadsUsed = isPeriodDay ? (padsUsed || 0) : 0;

        const [existingNote] = await db.execute(
            'SELECT id FROM daily_notes WHERE user_id = ? AND note_date = ?',
            [req.user.userId, formattedDate]
        );

        if (existingNote.length > 0) {
            await db.execute(
                `UPDATE daily_notes SET 
                    content = ?, 
                    mood = ?,
                    is_period_day = ?,
                    pads_used = ?,
                    period_intensity = ?,
                    period_notes = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND note_date = ?`,
                [
                    sanitizedContent, 
                    sanitizedMood,
                    isPeriodDay,
                    sanitizedPadsUsed,
                    sanitizedPeriodIntensity,
                    sanitizedPeriodNotes,
                    req.user.userId, 
                    formattedDate
                ]
            );
        } else {
            await db.execute(
                `INSERT INTO daily_notes 
                    (user_id, note_date, content, mood, is_period_day, pads_used, period_intensity, period_notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.user.userId, 
                    formattedDate, 
                    sanitizedContent, 
                    sanitizedMood,
                    isPeriodDay,
                    sanitizedPadsUsed,
                    sanitizedPeriodIntensity,
                    sanitizedPeriodNotes
                ]
            );
        }

        res.status(200).json({ 
            status: 'success', 
            message: 'Note saved successfully',
            data: {
                date: formattedDate,
                isPeriodDay,
                padsUsed: sanitizedPadsUsed
            }
        });
    } catch (error) {
        console.error('Note save error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   PUT /api/auth/notes/:id
router.put('/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { 
        content, 
        mood,
        isPeriodDay,
        padsUsed,
        periodIntensity,
        periodNotes
    } = req.body;

    // Validate inputs
    if (isPeriodDay !== undefined && padsUsed !== undefined && padsUsed < 0) {
        return res.status(400).json({ status: 'error', message: 'Pads used must be 0 or more' });
    }

    const validIntensities = ['light', 'medium', 'heavy'];
    if (periodIntensity && !validIntensities.includes(periodIntensity)) {
        return res.status(400).json({ status: 'error', message: 'Invalid period intensity' });
    }

    try {
        // Build dynamic update query
        const updateFields = [];
        const updateValues = [];
        
        // Sanitize and add content
        if (content !== undefined) {
            updateFields.push('content = ?');
            updateValues.push(sanitizeData(content));
        }
        
        // Sanitize and add mood
        if (mood !== undefined) {
            updateFields.push('mood = ?');
            updateValues.push(sanitizeData(mood));
        }
        
        // Handle isPeriodDay
        if (isPeriodDay !== undefined) {
            updateFields.push('is_period_day = ?');
            updateValues.push(isPeriodDay);
            
            // If turning off period day, reset period-related fields
            if (!isPeriodDay) {
                updateFields.push('pads_used = 0');
                updateFields.push('period_intensity = NULL');
                updateFields.push('period_notes = NULL');
            }
        }
        
        // Handle padsUsed only if isPeriodDay is true or being set
        if (padsUsed !== undefined) {
            if (isPeriodDay === true || isPeriodDay === undefined) {
                updateFields.push('pads_used = ?');
                updateValues.push(padsUsed >= 0 ? padsUsed : 0);
            }
        }
        
        // Handle periodIntensity only if isPeriodDay is true
        if (periodIntensity !== undefined) {
            if (isPeriodDay === true || isPeriodDay === undefined) {
                updateFields.push('period_intensity = ?');
                updateValues.push(validIntensities.includes(periodIntensity) ? periodIntensity : 'medium');
            }
        }
        
        // Handle periodNotes
        if (periodNotes !== undefined) {
            updateFields.push('period_notes = ?');
            updateValues.push(sanitizeData(periodNotes));
        }
        
        // Always update timestamp
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        
        // If no fields to update, return early
        if (updateFields.length === 1) { // Only updated_at
            return res.status(200).json({ 
                status: 'success', 
                message: 'No changes to update'
            });
        }
        
        // Add id and user_id at the end
        updateValues.push(id, req.user.userId);
        
        const query = `UPDATE daily_notes SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`;
        
        await db.execute(query, updateValues);

        res.status(200).json({ 
            status: 'success', 
            message: 'Note updated successfully',
            data: {
                isPeriodDay,
                padsUsed,
                periodIntensity
            }
        });
    } catch (error) {
        console.error('Note update error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   DELETE /api/auth/notes/:id
router.delete('/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;

    try {
        await db.execute(
            'DELETE FROM daily_notes WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );

        res.status(200).json({ status: 'success', message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Note delete error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/notes/history
router.get('/history', authenticateUser, async (req, res) => {
    const { startDate, endDate, limit, includePeriodOnly } = req.query;
    
    try {
        let query = `SELECT 
            id, 
            user_id, 
            note_date, 
            content, 
            mood,
            is_period_day,
            pads_used,
            period_intensity,
            period_notes,
            created_at,
            updated_at
         FROM daily_notes WHERE user_id = ?`;
        const params = [req.user.userId];

        if (startDate) {
            query += ' AND note_date >= ?';
            params.push(moment(startDate).format('YYYY-MM-DD'));
        }
        if (endDate) {
            query += ' AND note_date <= ?';
            params.push(moment(endDate).format('YYYY-MM-DD'));
        }
        if (includePeriodOnly === 'true') {
            query += ' AND is_period_day = TRUE';
        }

        query += ' ORDER BY note_date DESC';
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }

        const [notes] = await db.execute(query, params);

        res.status(200).json({
            status: 'success',
            data: notes
        });
    } catch (error) {
        console.error('Notes history fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/notes/period-summary
router.get('/period-summary', authenticateUser, async (req, res) => {
    const { startDate, endDate } = req.query;
    
    try {
        let query = `SELECT 
            ps.*,
            mc.start_date as cycle_start_date,
            mc.end_date as cycle_end_date
         FROM period_summary ps
         LEFT JOIN menstrual_cycles mc ON ps.cycle_id = mc.id
         WHERE ps.user_id = ?`;
        
        const params = [req.user.userId];

        if (startDate) {
            query += ' AND ps.start_date >= ?';
            params.push(moment(startDate).format('YYYY-MM-DD'));
        }
        if (endDate) {
            query += ' AND ps.end_date <= ?';
            params.push(moment(endDate).format('YYYY-MM-DD'));
        }

        query += ' ORDER BY ps.start_date DESC';

        const [periods] = await db.execute(query, params);

        res.status(200).json({
            status: 'success',
            data: periods
        });
    } catch (error) {
        console.error('Period summary fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/notes/current-period
router.get('/current-period', authenticateUser, async (req, res) => {
    try {
        // Get current period information (last 30 days)
        const [currentPeriod] = await db.execute(
            `SELECT 
                MIN(note_date) as period_start_date,
                MAX(note_date) as period_end_date,
                COUNT(*) as period_days,
                SUM(pads_used) as total_pads_used,
                AVG(pads_used) as avg_pads_per_day
             FROM daily_notes 
             WHERE user_id = ? 
               AND is_period_day = TRUE
               AND note_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
            [req.user.userId]
        );

        // Get period details for each day
        const [periodDetails] = await db.execute(
            `SELECT 
                note_date,
                pads_used,
                period_intensity,
                period_notes
             FROM daily_notes 
             WHERE user_id = ? 
               AND is_period_day = TRUE
               AND note_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             ORDER BY note_date ASC`,
            [req.user.userId]
        );

        res.status(200).json({
            status: 'success',
            data: {
                summary: currentPeriod[0] || null,
                details: periodDetails
            }
        });
    } catch (error) {
        console.error('Current period fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   POST /api/auth/notes/track-period
router.post('/track-period', authenticateUser, async (req, res) => {
    const { 
        startDate, 
        endDate, 
        padsUsed,
        intensity,
        notes
    } = req.body;

    if (!startDate) {
        return res.status(400).json({ status: 'error', message: 'Start date is required' });
    }

    try {
        const start = moment(startDate);
        const end = endDate ? moment(endDate) : start;
        
        // Validate date range
        if (end.isBefore(start)) {
            return res.status(400).json({ status: 'error', message: 'End date cannot be before start date' });
        }

        const days = [];
        let currentDate = start.clone();
        
        // Sanitize inputs
        const sanitizedPadsUsed = padsUsed || 0;
        const sanitizedIntensity = intensity || 'medium';
        const sanitizedNotes = sanitizeData(notes);
        
        // Create or update notes for each day in the period
        while (currentDate.isSameOrBefore(end)) {
            const formattedDate = currentDate.format('YYYY-MM-DD');
            
            const [existingNote] = await db.execute(
                'SELECT id FROM daily_notes WHERE user_id = ? AND note_date = ?',
                [req.user.userId, formattedDate]
            );

            if (existingNote.length > 0) {
                await db.execute(
                    `UPDATE daily_notes SET 
                        is_period_day = TRUE,
                        pads_used = ?,
                        period_intensity = ?,
                        period_notes = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ? AND note_date = ?`,
                    [
                        sanitizedPadsUsed,
                        sanitizedIntensity,
                        sanitizedNotes,
                        req.user.userId,
                        formattedDate
                    ]
                );
            } else {
                await db.execute(
                    `INSERT INTO daily_notes 
                        (user_id, note_date, is_period_day, pads_used, period_intensity, period_notes) 
                    VALUES (?, ?, TRUE, ?, ?, ?)`,
                    [
                        req.user.userId,
                        formattedDate,
                        sanitizedPadsUsed,
                        sanitizedIntensity,
                        sanitizedNotes
                    ]
                );
            }
            
            days.push(formattedDate);
            currentDate.add(1, 'day');
        }

        // Create or update menstrual cycle record
        const [existingCycle] = await db.execute(
            'SELECT id FROM menstrual_cycles WHERE user_id = ? AND start_date = ?',
            [req.user.userId, start.format('YYYY-MM-DD')]
        );

        if (existingCycle.length === 0) {
            await db.execute(
                'INSERT INTO menstrual_cycles (user_id, start_date, end_date, notes) VALUES (?, ?, ?, ?)',
                [
                    req.user.userId,
                    start.format('YYYY-MM-DD'),
                    end.format('YYYY-MM-DD'),
                    sanitizedNotes || `Period tracked: ${sanitizedPadsUsed} pads used`
                ]
            );
        }

        res.status(200).json({
            status: 'success',
            message: `Period tracked for ${days.length} day(s)`,
            data: {
                startDate: start.format('YYYY-MM-DD'),
                endDate: end.format('YYYY-MM-DD'),
                daysCount: days.length,
                totalPads: sanitizedPadsUsed * days.length,
                days
            }
        });
    } catch (error) {
        console.error('Period tracking error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/notes/period-stats
router.get('/period-stats', authenticateUser, async (req, res) => {
    try {
        // Get period statistics for the last 6 months
        const [stats] = await db.execute(
            `SELECT 
                COUNT(DISTINCT DATE_FORMAT(note_date, '%Y-%m')) as months_tracked,
                SUM(CASE WHEN is_period_day = TRUE THEN 1 ELSE 0 END) as period_days,
                SUM(pads_used) as total_pads_used,
                AVG(CASE WHEN is_period_day = TRUE THEN pads_used ELSE NULL END) as avg_pads_per_day,
                MIN(note_date) as first_tracked_date,
                MAX(note_date) as last_tracked_date
             FROM daily_notes 
             WHERE user_id = ? 
               AND note_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`,
            [req.user.userId]
        );

        // Get period intensity distribution
        const [intensityStats] = await db.execute(
            `SELECT 
                period_intensity,
                COUNT(*) as days_count
             FROM daily_notes 
             WHERE user_id = ? 
               AND is_period_day = TRUE
               AND note_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
               AND period_intensity IS NOT NULL
             GROUP BY period_intensity`,
            [req.user.userId]
        );

        // Get monthly pads usage
        const [monthlyStats] = await db.execute(
            `SELECT 
                DATE_FORMAT(note_date, '%Y-%m') as month,
                SUM(pads_used) as pads_used,
                COUNT(CASE WHEN is_period_day = TRUE THEN 1 END) as period_days
             FROM daily_notes 
             WHERE user_id = ? 
               AND note_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
             GROUP BY DATE_FORMAT(note_date, '%Y-%m')
             ORDER BY month DESC`,
            [req.user.userId]
        );

        res.status(200).json({
            status: 'success',
            data: {
                summary: stats[0] || {},
                intensityDistribution: intensityStats,
                monthlyStats: monthlyStats
            }
        });
    } catch (error) {
        console.error('Period stats fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/notes/period-dates
router.get('/period-dates', authenticateUser, async (req, res) => {
    const { startDate, endDate } = req.query;
    
    try {
        let query = `SELECT 
            note_date,
            pads_used,
            period_intensity,
            period_notes,
            content,
            mood
         FROM daily_notes 
         WHERE user_id = ? 
           AND is_period_day = TRUE`;
        
        const params = [req.user.userId];

        if (startDate) {
            query += ' AND note_date >= ?';
            params.push(moment(startDate).format('YYYY-MM-DD'));
        }
        if (endDate) {
            query += ' AND note_date <= ?';
            params.push(moment(endDate).format('YYYY-MM-DD'));
        }

        query += ' ORDER BY note_date DESC';

        const [periodDates] = await db.execute(query, params);

        res.status(200).json({
            status: 'success',
            data: periodDates
        });
    } catch (error) {
        console.error('Period dates fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

module.exports = router;