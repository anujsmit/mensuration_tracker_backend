const express = require('express');
const router = express.Router();
const db = require('../config/db');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const { stringify } = require('csv-stringify');
const { authenticateUser } = require('../middlewares/auth'); // FIX: Use consistent authentication middleware

// The original verifyToken logic is now replaced by authenticateUser middleware
// const verifyToken = (req, res, next) => { ... };

// Enhanced input validation helper (Includes FIX: Case normalization for enums)
const validateProfileInput = (data) => {
    const errors = [];
    if (!data.age || isNaN(data.age) || data.age < 0 || data.age > 120) errors.push('Valid age is required (0-120)');
    if (data.weight && (isNaN(data.weight) || data.weight < 0 || data.weight > 500)) errors.push('Invalid weight (0-500)');
    if (data.height && (isNaN(data.height) || data.height < 0 || data.height > 300)) errors.push('Invalid height (0-300)');
    if (data.cycleLength && (isNaN(data.cycleLength) || data.cycleLength < 0 || data.cycleLength > 365)) errors.push('Invalid cycle length');
    if (data.ageAtMenarche && (isNaN(data.ageAtMenarche) || data.ageAtMenarche < 0 || data.ageAtMenarche > 30)) errors.push('Invalid age at menarche');
    if (data.bleedingDuration && (isNaN(data.bleedingDuration) || data.bleedingDuration < 0 || data.bleedingDuration > 30)) errors.push('Invalid bleeding duration');
    if (data.periodInterval && (isNaN(data.periodInterval) || data.periodInterval < 0 || data.periodInterval > 365)) errors.push('Invalid period interval');
    
    // FIX: Normalize casing for validation against database ENUM values
    const validRegularity = ['regular', 'usually_regular', 'usually_irregular', 'always_irregular'];
    if (data.flowRegularity && !validRegularity.includes(data.flowRegularity.toLowerCase())) errors.push('Invalid flow regularity');

    const validAmount = ['light', 'moderate', 'heavy'];
    if (data.flowAmount && !validAmount.includes(data.flowAmount.toLowerCase())) errors.push('Invalid flow amount');
    
    return errors;
};

// Function to aggregate data for the report (Used by the new /report route)
const fetchUserDataForReport = async (userId) => {
    // Fetch user-specific data from all relevant tables
    const [profileData] = await db.execute('SELECT age, weight, height, cycle_length, bleeding_duration, flow_regularity, flow_amount FROM profile WHERE user_id = ?', [userId]);
    const [cycleData] = await db.execute('SELECT start_date, end_date, notes FROM menstrual_cycles WHERE user_id = ? ORDER BY start_date DESC', [userId]);
    const [symptomData] = await db.execute('SELECT symptom_date, symptom_type, severity, notes FROM symptoms WHERE user_id = ? ORDER BY symptom_date DESC', [userId]);
    const [noteData] = await db.execute('SELECT note_date, content, mood FROM daily_notes WHERE user_id = ? ORDER BY note_date DESC', [userId]);

    return {
        profile: profileData[0] || {},
        cycles: cycleData,
        symptoms: symptomData,
        notes: noteData
    };
};

// @route   GET /api/auth/profile
router.get('/', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    try {
        // Use req.user.userId from authenticateUser middleware
        const [profile] = await db.execute('SELECT * FROM profile WHERE user_id = ?', [req.user.userId]);

        // Fetch username and email from users table
        const [users] = await db.execute('SELECT username, email FROM users WHERE id = ?', [req.user.userId]);
        const userData = users[0] || {};
        
        res.status(200).json({
            status: 'success',
            profile: profile[0],
            hasProfile: profile.length > 0,
            username: userData.username,
            email: userData.email,
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   POST /api/auth/profile
router.post('/', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const {
        age,
        weight,
        height,
        cycleLength,
        lastPeriodDate,
        ageAtMenarche,
        flowRegularity,
        bleedingDuration,
        flowAmount,
        periodInterval
    } = req.body;

    const errors = validateProfileInput(req.body);
    if (errors.length > 0) {
        return res.status(400).json({ status: 'error', message: errors.join(', ') });
    }

    try {
        // Use req.user.userId from authenticateUser middleware
        const [users] = await db.execute('SELECT id FROM users WHERE id = ?', [req.user.userId]);
        if (users.length === 0) {
            // This should ideally not happen if authenticateUser runs successfully
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        const formattedLastPeriodDate = lastPeriodDate
            ? moment(lastPeriodDate).format('YYYY-MM-DD')
            : null;
        
        // FIX: Convert to lowercase for database ENUM compatibility
        const convertedFlowRegularity = flowRegularity ? flowRegularity.toLowerCase() : null;
        const convertedFlowAmount = flowAmount ? flowAmount.toLowerCase() : null;

        const [existingProfile] = await db.execute('SELECT id FROM profile WHERE user_id = ?', [req.user.userId]);

        if (existingProfile.length > 0) {
            await db.execute(
                `UPDATE profile SET 
                    age = ?, 
                    weight = ?, 
                    height = ?, 
                    cycle_length = ?, 
                    last_period_date = ?, 
                    age_at_menarche = ?, 
                    flow_regularity = ?, 
                    bleeding_duration = ?, 
                    flow_amount = ?, 
                    period_interval = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?`,
                [
                    age,
                    weight || null,
                    height || null,
                    cycleLength || null,
                    formattedLastPeriodDate,
                    ageAtMenarche || null,
                    convertedFlowRegularity, 
                    bleedingDuration || null,
                    convertedFlowAmount,      
                    periodInterval || null,
                    req.user.userId
                ]
            );
            res.status(200).json({ status: 'success', message: 'Profile updated successfully' });
        } else {
            await db.execute(
                `INSERT INTO profile (
                    user_id, age, weight, height, cycle_length, last_period_date, 
                    age_at_menarche, flow_regularity, bleeding_duration, flow_amount, period_interval
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.user.userId,
                    age,
                    weight || null,
                    height || null,
                    cycleLength || null,
                    formattedLastPeriodDate,
                    ageAtMenarche || null,
                    convertedFlowRegularity,
                    bleedingDuration || null,
                    convertedFlowAmount,
                    periodInterval || null
                ]
            );
            res.status(201).json({ status: 'success', message: 'Profile created successfully' });
        }
    } catch (error) {
        console.error('Profile save error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/profile/report (NEW REPORT ROUTE)
router.get('/report', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    try {
        const userId = req.user.userId; // Use req.user.userId
        const reportData = await fetchUserDataForReport(userId);
        
        // --- 1. Prepare Data for CSV ---
        let records = [];
        
        // Header Row for the main log format
        records.push([
            'Record Type', 'Date', 'End Date', 'Notes', 'Symptom Type', 
            'Symptom Severity', 'Daily Note Content', 'Daily Note Mood', 'Profile Key Info'
        ]);

        // Add Profile Data as the first record for reference
        const p = reportData.profile;
        const profileInfo = `Age: ${p.age || '-'}, Weight: ${p.weight || '-'}, Cycle: ${p.cycle_length || '-'} days, Flow Regularity: ${p.flow_regularity || '-'}, Flow Amount: ${p.flow_amount || '-'}`;
        records.push(['PROFILE_INFO', '', '', '', '', '', '', '', profileInfo]);
        
        // Combine and sort records by date (Simplification: just append for a general report)
        
        // Add Cycle Data
        reportData.cycles.forEach(c => {
            records.push([
                'CYCLE', moment(c.start_date).format('YYYY-MM-DD'), c.end_date ? moment(c.end_date).format('YYYY-MM-DD') : '', c.notes || '', '', '', '', '', ''
            ]);
        });
        
        // Add Symptom Data
        reportData.symptoms.forEach(s => {
            records.push([
                'SYMPTOM', moment(s.symptom_date).format('YYYY-MM-DD'), '', s.notes || '', s.symptom_type, s.severity || '', '', '', ''
            ]);
        });

        // Add Note Data
        reportData.notes.forEach(n => {
            records.push([
                'NOTE', moment(n.note_date).format('YYYY-MM-DD'), '', '', '', '', n.content, n.mood || '', ''
            ]);
        });

        // --- 2. Generate CSV String ---
        stringify(records, (err, output) => {
            if (err) {
                console.error('CSV stringify error:', err);
                return res.status(500).json({ status: 'error', message: 'Failed to generate report data' });
            }

            // --- 3. Set Headers for Download ---
            const timestamp = moment().format('YYYYMMDD_HHmmss');
            const filename = `health_report_${userId}_${timestamp}.csv`;
            
            // These headers tell the browser/client to download a file
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            // --- 4. Send the CSV file ---
            res.status(200).send(output);
        });

    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error during report generation' });
    }
});
// (END OF NEW REPORT ROUTE)


// @route   GET /api/auth/profile/last-period
router.get('/last-period', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    try {
        const [profile] = await db.execute(
            'SELECT last_period_date FROM profile WHERE user_id = ?',
            [req.user.userId] // Use req.user.userId
        );

        if (profile.length === 0 || !profile[0].last_period_date) {
            return res.status(200).json({
                status: 'success',
                hasData: false,
                message: 'No period data found'
            });
        }

        res.status(200).json({
            status: 'success',
            hasData: true,
            lastPeriodDate: profile[0].last_period_date
        });
    } catch (error) {
        console.error('Last period fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/profile/cycles
router.get('/cycles', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    try {
        const [cycles] = await db.execute('SELECT * FROM menstrual_cycles WHERE user_id = ? ORDER BY start_date DESC', [req.user.userId]); // Use req.user.userId

        res.status(200).json({
            status: 'success',
            data: cycles
        });
    } catch (error) {
        console.error('Cycles fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   POST /api/auth/profile/cycles
router.post('/cycles', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { startDate, endDate, notes } = req.body;

    if (!startDate) {
        return res.status(400).json({ status: 'error', message: 'Start date is required' });
    }

    try {
        const formattedStartDate = moment(startDate).format('YYYY-MM-DD');
        const formattedEndDate = endDate ? moment(endDate).format('YYYY-MM-DD') : null;

        await db.execute(
            'INSERT INTO menstrual_cycles (user_id, start_date, end_date, notes) VALUES (?, ?, ?, ?)',
            [req.user.userId, formattedStartDate, formattedEndDate, notes || null] // Use req.user.userId
        );

        res.status(201).json({ status: 'success', message: 'Cycle recorded successfully' });
    } catch (error) {
        console.error('Cycle save error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/profile/symptoms
router.get('/symptoms', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { startDate, endDate, symptomType } = req.query;

    try {
        let query = 'SELECT s.*, mc.start_date as cycle_start_date FROM symptoms s LEFT JOIN menstrual_cycles mc ON s.cycle_id = mc.id WHERE s.user_id = ?';
        const params = [req.user.userId]; // Use req.user.userId

        if (startDate) {
            query += ' AND s.symptom_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND s.symptom_date <= ?';
            params.push(endDate);
        }
        if (symptomType) {
            query += ' AND s.symptom_type = ?';
            params.push(symptomType);
        }

        query += ' ORDER BY s.symptom_date DESC';

        const [symptoms] = await db.execute(query, params);

        res.status(200).json({
            status: 'success',
            data: symptoms
        });
    } catch (error) {
        console.error('Symptoms fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   POST /api/auth/profile/symptoms
router.post('/symptoms', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { date, symptomType, severity, notes, cycleId } = req.body;

    if (!date || !symptomType) {
        return res.status(400).json({ status: 'error', message: 'Date and symptom type are required' });
    }

    try {
        const formattedDate = moment(date).format('YYYY-MM-DD');

        await db.execute(
            'INSERT INTO symptoms (user_id, symptom_date, symptom_type, severity, notes, cycle_id) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.userId, formattedDate, symptomType, severity || null, notes || null, cycleId || null] // Use req.user.userId
        );

        res.status(201).json({ status: 'success', message: 'Symptom recorded successfully' });
    } catch (error) {
        console.error('Symptom save error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/profile/calendar
router.get('/calendar', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { year, month } = req.query;
    
    if (!year || !month) {
        return res.status(400).json({ status: 'error', message: 'Year and month are required' });
    }
    
    try {
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');

        // Get profile data for cycle information
        const [profile] = await db.execute(
            'SELECT cycle_length, last_period_date, bleeding_duration FROM profile WHERE user_id = ?',
            [req.user.userId] // Use req.user.userId
        );

        let calendarData = [];
        
        if (profile.length > 0 && profile[0].last_period_date && profile[0].cycle_length) {
            const cycleLength = profile[0].cycle_length || 28;
            const periodLength = profile[0].bleeding_duration || 5;
            const lastPeriod = moment(profile[0].last_period_date);
            
            // Calculate cycle days for the requested month
            const startOfMonth = moment(startDate);
            const endOfMonth = moment(endDate);
            
            let currentDate = startOfMonth.clone();
            while (currentDate.isSameOrBefore(endOfMonth)) {
                const daysSinceLastPeriod = currentDate.diff(lastPeriod, 'days');
                // Calculate the current day in the cycle (1-indexed)
                const dayOfCycle = (daysSinceLastPeriod % cycleLength) + 1;
                
                let eventType = null;
                if (dayOfCycle <= periodLength) {
                    eventType = 'Period';
                } else {
                    const ovulationDay = cycleLength - 14;
                    const fertileStart = ovulationDay - 5;
                    const fertileEnd = ovulationDay + 1;
                    
                    if (dayOfCycle >= fertileStart && dayOfCycle <= fertileEnd) {
                        eventType = 'Fertile';
                    }
                    if (dayOfCycle === ovulationDay) {
                        eventType = 'Ovulation';
                    }
                }
                
                if (eventType) {
                    calendarData.push({
                        date: currentDate.format('YYYY-MM-DD'),
                        event: eventType
                    });
                }
                
                currentDate.add(1, 'day');
            }
        }

        // Get notes for the month
        const [notes] = await db.execute(
            'SELECT note_date as date, content, mood FROM daily_notes WHERE user_id = ? AND note_date BETWEEN ? AND ? ORDER BY note_date',
            [req.user.userId, startDate, endDate] // Use req.user.userId
        );

        res.status(200).json({
            status: 'success',
            data: {
                events: calendarData,
                notes: notes
            }
        });
    } catch (error) {
        console.error('Calendar fetch error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   GET /api/auth/profile/notes
router.get('/notes', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { date } = req.query;
    
    if (!date) {
        return res.status(400).json({ status: 'error', message: 'Date is required' });
    }
    
    try {
        const formattedDate = moment(date).format('YYYY-MM-DD');
        
        const [notes] = await db.execute(
            'SELECT * FROM daily_notes WHERE user_id = ? AND note_date = ?',
            [req.user.userId, formattedDate] // Use req.user.userId
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

// @route   POST /api/auth/profile/notes
router.post('/notes', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { date, content, mood } = req.body;

    if (!date) {
        return res.status(400).json({ status: 'error', message: 'Date is required' });
    }

    try {
        const formattedDate = moment(date).format('YYYY-MM-DD');

        // Check if note already exists
        const [existingNote] = await db.execute(
            'SELECT id FROM daily_notes WHERE user_id = ? AND note_date = ?',
            [req.user.userId, formattedDate] // Use req.user.userId
        );

        if (existingNote.length > 0) {
            // Update existing note
            await db.execute(
                `UPDATE daily_notes SET 
                    content = ?, mood = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND note_date = ?`,
                [content, mood, req.user.userId, formattedDate] // Use req.user.userId
            );
        } else {
            // Insert new note
            await db.execute(
                'INSERT INTO daily_notes (user_id, note_date, content, mood) VALUES (?, ?, ?, ?)',
                [req.user.userId, formattedDate, content, mood] // Use req.user.userId
            );
        }

        res.status(200).json({ status: 'success', message: 'Note saved successfully' });
    } catch (error) {
        console.error('Note save error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   PUT /api/auth/profile/notes/:id
router.put('/notes/:id', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    const { id } = req.params;
    const { content, mood } = req.body;

    try {
        await db.execute(
            'UPDATE daily_notes SET content = ?, mood = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [content, mood, id, req.user.userId] // Use req.user.userId
        );

        res.status(200).json({ status: 'success', message: 'Note updated successfully' });
    } catch (error) {
        console.error('Note update error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

// @route   POST /api/auth/profile/predict-cycle
router.post('/predict-cycle', authenticateUser, async (req, res) => { // FIX: Replaced verifyToken with authenticateUser
    try {
        // Get last 6 cycles for prediction
        const [cycles] = await db.execute(
            'SELECT start_date, end_date FROM menstrual_cycles WHERE user_id = ? ORDER BY start_date DESC LIMIT 6',
            [req.user.userId] // Use req.user.userId
        );

        if (cycles.length < 3) {
            return res.status(400).json({
                status: 'error',
                message: 'Not enough cycle data for prediction'
            });
        }

        // Calculate average cycle length
        let totalLength = 0;
        for (let i = 0; i < cycles.length - 1; i++) {
            const start = moment(cycles[i + 1].start_date); // Corrected: Compare current cycle's start to previous cycle's start
            const nextStart = moment(cycles[i].start_date);
            totalLength += nextStart.diff(start, 'days');
        }
        // FIX: Handle the case where cycles.length is 1 or 2 more gracefully in avg calculation
        const numCycles = cycles.length > 1 ? (cycles.length - 1) : 1;
        const avgCycleLength = Math.round(totalLength / numCycles) || 28;

        // Predict next 12 months
        const lastCycle = cycles[0];
        const predictions = [];
        let currentDate = moment(lastCycle.start_date);

        for (let i = 0; i < 12; i++) {
            currentDate = currentDate.add(avgCycleLength, 'days');
            
            predictions.push({
                cycle_number: i + 1,
                predicted_start: currentDate.format('YYYY-MM-DD'),
                predicted_end: currentDate.clone().add(4, 'days').format('YYYY-MM-DD'), // Assuming 5-day period (start day + 4 more days)
                cycle_length: avgCycleLength
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                average_cycle_length: avgCycleLength,
                predictions
            }
        });
    } catch (error) {
        console.error('Cycle prediction error:', error);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});

module.exports = router;