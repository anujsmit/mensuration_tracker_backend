const express = require('express');
const router = express.Router();
const db = require('../config/db');
const moment = require('moment');
const { stringify } = require('csv-stringify');
const { authenticateUser } = require('../middlewares/auth');

const fetchUserDataForReport = async (userId) => {
    const [profileData] = await db.execute('SELECT age, weight, height, cycle_length, bleeding_duration, flow_regularity, flow_amount FROM profile WHERE user_id = ?', [userId]);
    const [cycleData] = await db.execute('SELECT start_date, end_date, notes FROM menstrual_cycles WHERE user_id = ? ORDER BY start_date DESC', [userId]);
    const [symptomData] = await db.execute('SELECT symptom_date, symptom_type, severity, notes FROM symptoms WHERE user_id = ? ORDER BY symptom_date DESC', [userId]);
    const [noteData] = await db.execute(`
        SELECT 
            note_date, 
            content, 
            mood,
            is_period_day,
            pads_used,
            period_intensity,
            period_notes 
        FROM daily_notes 
        WHERE user_id = ? 
        ORDER BY note_date DESC`, 
        [userId]
    );
    const [periodSummaryData] = await db.execute(`
        SELECT 
            start_date,
            end_date,
            total_pads_used,
            average_intensity,
            notes
        FROM period_summary 
        WHERE user_id = ? 
        ORDER BY start_date DESC`, 
        [userId]
    );

    return {
        profile: profileData[0] || {},
        cycles: cycleData,
        symptoms: symptomData,
        notes: noteData,
        periodSummaries: periodSummaryData
    };
};

// @route   GET /api/auth/reports/health
router.get('/health', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const reportData = await fetchUserDataForReport(userId);
        
        let records = [];
        records.push([
            'Record Type', 'Date', 'End Date', 'Notes', 'Symptom Type', 
            'Symptom Severity', 'Daily Note Content', 'Daily Note Mood', 
            'Is Period Day', 'Pads Used', 'Period Intensity', 'Period Notes', 'Profile Key Info'
        ]);

        // Add Profile Data as the first record for reference
        const p = reportData.profile;
        const profileInfo = `Age: ${p.age || '-'}, Weight: ${p.weight || '-'}, Height: ${p.height || '-'} cm, Cycle Length: ${p.cycle_length || '-'} days, Bleeding Duration: ${p.bleeding_duration || '-'} days, Flow Regularity: ${p.flow_regularity || '-'}, Flow Amount: ${p.flow_amount || '-'}`;
        records.push(['PROFILE_INFO', '', '', '', '', '', '', '', '', '', '', '', profileInfo]);
        
        // Add Cycle Data
        reportData.cycles.forEach(c => {
            records.push([
                'CYCLE', 
                moment(c.start_date).format('YYYY-MM-DD'), 
                c.end_date ? moment(c.end_date).format('YYYY-MM-DD') : '', 
                c.notes || '', 
                '', '', '', '', '', '', '', '', ''
            ]);
        });
        
        // Add Symptom Data
        reportData.symptoms.forEach(s => {
            records.push([
                'SYMPTOM', 
                moment(s.symptom_date).format('YYYY-MM-DD'), 
                '', 
                s.notes || '', 
                s.symptom_type, 
                s.severity || '', 
                '', '', '', '', '', '', ''
            ]);
        });

        // Add Note Data
        reportData.notes.forEach(n => {
            records.push([
                'NOTE', 
                moment(n.note_date).format('YYYY-MM-DD'), 
                '', 
                '', 
                '', '', 
                n.content, 
                n.mood || '', 
                n.is_period_day ? 'Yes' : 'No',
                n.pads_used || 0,
                n.period_intensity || '',
                n.period_notes || '',
                ''
            ]);
        });

        // Add Period Summary Data
        reportData.periodSummaries.forEach(p => {
            records.push([
                'PERIOD_SUMMARY', 
                moment(p.start_date).format('YYYY-MM-DD'), 
                p.end_date ? moment(p.end_date).format('YYYY-MM-DD') : '', 
                p.notes || '', 
                '', 
                '', 
                '', 
                '', 
                '', 
                p.total_pads_used || 0,
                p.average_intensity || '',
                '',
                `Period Duration: ${p.start_date && p.end_date ? moment(p.end_date).diff(moment(p.start_date), 'days') + 1 : 'N/A'} days`
            ]);
        });

        // Generate CSV String
        stringify(records, (err, output) => {
            if (err) {
                console.error('CSV stringify error:', err);
                return res.status(500).json({ status: 'error', message: 'Failed to generate report data' });
            }

            const timestamp = moment().format('YYYYMMDD_HHmmss');
            const filename = `health_report_${userId}_${timestamp}.csv`;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            res.status(200).send(output);
        });

    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error during report generation' });
    }
});

// @route   GET /api/auth/reports/summary
router.get('/summary', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const reportData = await fetchUserDataForReport(userId);
        
        // Calculate statistics
        const summary = {
            profile: reportData.profile,
            totalCycles: reportData.cycles.length,
            totalSymptoms: reportData.symptoms.length,
            totalNotes: reportData.notes.length,
            periodDays: 0,
            totalPadsUsed: 0,
            symptomBreakdown: {},
            moodBreakdown: {},
            periodIntensityBreakdown: {}
        };

        // Process notes for period data
        reportData.notes.forEach(n => {
            if (n.is_period_day) {
                summary.periodDays++;
                summary.totalPadsUsed += (n.pads_used || 0);
            }
            
            const mood = n.mood || 'Unspecified';
            summary.moodBreakdown[mood] = (summary.moodBreakdown[mood] || 0) + 1;
            
            if (n.period_intensity) {
                summary.periodIntensityBreakdown[n.period_intensity] = (summary.periodIntensityBreakdown[n.period_intensity] || 0) + 1;
            }
        });

        // Symptom type breakdown
        reportData.symptoms.forEach(s => {
            const type = s.symptom_type || 'Unknown';
            summary.symptomBreakdown[type] = (summary.symptomBreakdown[type] || 0) + 1;
        });

        // Calculate average cycle length if we have cycles
        if (reportData.cycles.length >= 2) {
            let totalDays = 0;
            for (let i = 0; i < reportData.cycles.length - 1; i++) {
                const start = moment(reportData.cycles[i + 1].start_date);
                const end = moment(reportData.cycles[i].start_date);
                totalDays += end.diff(start, 'days');
            }
            summary.averageCycleLength = Math.round(totalDays / (reportData.cycles.length - 1));
        }

        // Calculate average pads per period day
        if (summary.periodDays > 0) {
            summary.averagePadsPerDay = Math.round((summary.totalPadsUsed / summary.periodDays) * 100) / 100;
        }

        // Add period summaries
        summary.periodSummaries = reportData.periodSummaries;

        res.status(200).json({
            status: 'success',
            data: summary
        });

    } catch (error) {
        console.error('Summary report error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// @route   GET /api/auth/reports/cycles
router.get('/cycles', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const [cycles] = await db.execute(
            'SELECT * FROM menstrual_cycles WHERE user_id = ? ORDER BY start_date DESC',
            [userId]
        );

        const [symptoms] = await db.execute(
            'SELECT symptom_date, symptom_type, severity FROM symptoms WHERE user_id = ? ORDER BY symptom_date DESC',
            [userId]
        );

        const [periodData] = await db.execute(
            `SELECT 
                note_date,
                pads_used,
                period_intensity,
                period_notes
             FROM daily_notes 
             WHERE user_id = ? 
               AND is_period_day = TRUE
             ORDER BY note_date DESC`,
            [userId]
        );

        // Organize symptoms and period data by cycle
        const cycleReport = cycles.map(cycle => {
            const cycleSymptoms = symptoms.filter(s => 
                moment(s.symptom_date).isBetween(
                    moment(cycle.start_date).subtract(2, 'days'),
                    moment(cycle.end_date || cycle.start_date).add(2, 'days')
                )
            );

            const cyclePeriodDays = periodData.filter(p => 
                moment(p.note_date).isBetween(
                    moment(cycle.start_date),
                    moment(cycle.end_date || cycle.start_date),
                    null,
                    '[]'
                )
            );

            const totalPads = cyclePeriodDays.reduce((sum, day) => sum + (day.pads_used || 0), 0);

            return {
                cycle_number: cycles.indexOf(cycle) + 1,
                start_date: cycle.start_date,
                end_date: cycle.end_date,
                duration: cycle.end_date ? 
                    moment(cycle.end_date).diff(moment(cycle.start_date), 'days') + 1 : 
                    null,
                notes: cycle.notes,
                symptoms: cycleSymptoms,
                total_symptoms: cycleSymptoms.length,
                period_days: cyclePeriodDays.length,
                period_dates: cyclePeriodDays.map(d => d.note_date),
                total_pads_used: totalPads,
                period_intensities: cyclePeriodDays.map(d => d.period_intensity),
                period_notes: cyclePeriodDays.map(d => d.period_notes).filter(n => n)
            };
        });

        res.status(200).json({
            status: 'success',
            data: cycleReport
        });

    } catch (error) {
        console.error('Cycles report error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// @route   GET /api/auth/reports/periods
router.get('/periods', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                ps.*,
                mc.start_date as cycle_start_date,
                mc.end_date as cycle_end_date,
                mc.notes as cycle_notes
            FROM period_summary ps
            LEFT JOIN menstrual_cycles mc ON ps.cycle_id = mc.id
            WHERE ps.user_id = ?`;
        
        const params = [userId];

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

        // Get detailed period day information for each period
        const detailedPeriods = await Promise.all(periods.map(async (period) => {
            const [periodDays] = await db.execute(
                `SELECT 
                    note_date,
                    pads_used,
                    period_intensity,
                    period_notes,
                    content as daily_note,
                    mood
                 FROM daily_notes 
                 WHERE user_id = ? 
                   AND is_period_day = TRUE
                   AND note_date BETWEEN ? AND ?
                 ORDER BY note_date ASC`,
                [userId, period.start_date, period.end_date || period.start_date]
            );

            return {
                ...period,
                period_days: periodDays,
                duration_days: period.end_date ? 
                    moment(period.end_date).diff(moment(period.start_date), 'days') + 1 : 
                    1,
                average_pads_per_day: period.total_pads_used && period.end_date ?
                    Math.round((period.total_pads_used / (moment(period.end_date).diff(moment(period.start_date), 'days') + 1)) * 100) / 100 :
                    period.total_pads_used
            };
        }));

        // Calculate overall period statistics
        const totalPeriods = periods.length;
        const totalPadsUsed = periods.reduce((sum, p) => sum + (p.total_pads_used || 0), 0);
        const totalPeriodDays = periods.reduce((sum, p) => {
            if (p.end_date) {
                return sum + (moment(p.end_date).diff(moment(p.start_date), 'days') + 1);
            }
            return sum + 1;
        }, 0);

        const statistics = {
            total_periods: totalPeriods,
            total_period_days: totalPeriodDays,
            total_pads_used: totalPadsUsed,
            average_pads_per_period: totalPeriods > 0 ? Math.round((totalPadsUsed / totalPeriods) * 100) / 100 : 0,
            average_period_length: totalPeriods > 0 ? Math.round((totalPeriodDays / totalPeriods) * 100) / 100 : 0
        };

        res.status(200).json({
            status: 'success',
            data: {
                periods: detailedPeriods,
                statistics
            }
        });

    } catch (error) {
        console.error('Periods report error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// @route   GET /api/auth/reports/symptoms-analysis
router.get('/symptoms-analysis', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                symptom_type,
                severity,
                COUNT(*) as occurrence_count,
                MIN(symptom_date) as first_occurrence,
                MAX(symptom_date) as last_occurrence,
                GROUP_CONCAT(DISTINCT notes SEPARATOR ' | ') as all_notes
            FROM symptoms 
            WHERE user_id = ?`;
        
        const params = [userId];

        if (startDate) {
            query += ' AND symptom_date >= ?';
            params.push(moment(startDate).format('YYYY-MM-DD'));
        }
        if (endDate) {
            query += ' AND symptom_date <= ?';
            params.push(moment(endDate).format('YYYY-MM-DD'));
        }

        query += ' GROUP BY symptom_type, severity ORDER BY occurrence_count DESC';

        const [symptomsAnalysis] = await db.execute(query, params);

        // Get symptoms by cycle phase
        const [symptomsByPhase] = await db.execute(`
            SELECT 
                s.symptom_type,
                s.severity,
                CASE 
                    WHEN DATEDIFF(s.symptom_date, mc.start_date) <= p.bleeding_duration THEN 'menstruation'
                    WHEN DATEDIFF(s.symptom_date, mc.start_date) <= p.cycle_length - 14 THEN 'follicular'
                    ELSE 'luteal'
                END as cycle_phase,
                COUNT(*) as count
            FROM symptoms s
            LEFT JOIN menstrual_cycles mc ON s.cycle_id = mc.id
            LEFT JOIN profile p ON s.user_id = p.user_id
            WHERE s.user_id = ?
            GROUP BY s.symptom_type, s.severity, cycle_phase
            ORDER BY cycle_phase, count DESC`,
            [userId]
        );

        // Get monthly symptom trends
        const [monthlyTrends] = await db.execute(`
            SELECT 
                DATE_FORMAT(symptom_date, '%Y-%m') as month,
                symptom_type,
                COUNT(*) as occurrence_count
            FROM symptoms 
            WHERE user_id = ?
            GROUP BY DATE_FORMAT(symptom_date, '%Y-%m'), symptom_type
            ORDER BY month DESC, occurrence_count DESC`,
            [userId]
        );

        res.status(200).json({
            status: 'success',
            data: {
                symptomsAnalysis,
                symptomsByPhase,
                monthlyTrends
            }
        });

    } catch (error) {
        console.error('Symptoms analysis error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// @route   GET /api/auth/reports/monthly
router.get('/monthly', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { year, month } = req.query;
        
        if (!year || !month) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Year and month are required' 
            });
        }

        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');

        // Get notes for the month
        const [notes] = await db.execute(`
            SELECT 
                note_date,
                content,
                mood,
                is_period_day,
                pads_used,
                period_intensity,
                period_notes
            FROM daily_notes 
            WHERE user_id = ? 
              AND note_date BETWEEN ? AND ?
            ORDER BY note_date`,
            [userId, startDate, endDate]
        );

        // Get symptoms for the month
        const [symptoms] = await db.execute(`
            SELECT 
                symptom_date,
                symptom_type,
                severity,
                notes
            FROM symptoms 
            WHERE user_id = ? 
              AND symptom_date BETWEEN ? AND ?
            ORDER BY symptom_date`,
            [userId, startDate, endDate]
        );

        // Get cycles for the month
        const [cycles] = await db.execute(`
            SELECT *
            FROM menstrual_cycles 
            WHERE user_id = ? 
              AND (
                start_date BETWEEN ? AND ?
                OR end_date BETWEEN ? AND ?
                OR (start_date <= ? AND (end_date IS NULL OR end_date >= ?))
              )
            ORDER BY start_date`,
            [userId, startDate, endDate, startDate, endDate, startDate, endDate]
        );

        // Calculate period statistics for the month
        const periodDays = notes.filter(n => n.is_period_day);
        const periodStats = {
            total_days: periodDays.length,
            total_pads: periodDays.reduce((sum, day) => sum + (day.pads_used || 0), 0),
            intensity_distribution: periodDays.reduce((acc, day) => {
                const intensity = day.period_intensity || 'unknown';
                acc[intensity] = (acc[intensity] || 0) + 1;
                return acc;
            }, {})
        };

        // Calculate symptom statistics for the month
        const symptomStats = symptoms.reduce((acc, symptom) => {
            const type = symptom.symptom_type || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        // Mood distribution for the month
        const moodStats = notes.reduce((acc, note) => {
            const mood = note.mood || 'unknown';
            acc[mood] = (acc[mood] || 0) + 1;
            return acc;
        }, {});

        res.status(200).json({
            status: 'success',
            data: {
                month: `${year}-${month}`,
                start_date: startDate,
                end_date: endDate,
                total_days: moment(endDate).diff(moment(startDate), 'days') + 1,
                notes,
                symptoms,
                cycles,
                statistics: {
                    period: periodStats,
                    symptoms: symptomStats,
                    mood: moodStats,
                    total_notes: notes.length,
                    total_symptoms: symptoms.length
                }
            }
        });

    } catch (error) {
        console.error('Monthly report error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// @route   GET /api/auth/reports/custom
router.get('/custom', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { startDate, endDate, includeNotes = true, includeSymptoms = true, includeCycles = true, includePeriods = true } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Start date and end date are required' 
            });
        }

        const formattedStartDate = moment(startDate).format('YYYY-MM-DD');
        const formattedEndDate = moment(endDate).format('YYYY-MM-DD');

        const reportData = {};

        // Get profile data
        const [profile] = await db.execute(
            'SELECT age, weight, height, cycle_length, bleeding_duration, flow_regularity, flow_amount FROM profile WHERE user_id = ?',
            [userId]
        );
        reportData.profile = profile[0] || {};

        // Get notes if requested
        if (includeNotes === 'true') {
            const [notes] = await db.execute(`
                SELECT 
                    note_date,
                    content,
                    mood,
                    is_period_day,
                    pads_used,
                    period_intensity,
                    period_notes
                FROM daily_notes 
                WHERE user_id = ? 
                  AND note_date BETWEEN ? AND ?
                ORDER BY note_date`,
                [userId, formattedStartDate, formattedEndDate]
            );
            reportData.notes = notes;
        }

        // Get symptoms if requested
        if (includeSymptoms === 'true') {
            const [symptoms] = await db.execute(`
                SELECT 
                    symptom_date,
                    symptom_type,
                    severity,
                    notes
                FROM symptoms 
                WHERE user_id = ? 
                  AND symptom_date BETWEEN ? AND ?
                ORDER BY symptom_date`,
                [userId, formattedStartDate, formattedEndDate]
            );
            reportData.symptoms = symptoms;
        }

        // Get cycles if requested
        if (includeCycles === 'true') {
            const [cycles] = await db.execute(`
                SELECT *
                FROM menstrual_cycles 
                WHERE user_id = ? 
                  AND (
                    start_date BETWEEN ? AND ?
                    OR end_date BETWEEN ? AND ?
                    OR (start_date <= ? AND (end_date IS NULL OR end_date >= ?))
                  )
                ORDER BY start_date`,
                [userId, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate]
            );
            reportData.cycles = cycles;
        }

        // Get period summaries if requested
        if (includePeriods === 'true') {
            const [periods] = await db.execute(`
                SELECT 
                    ps.*,
                    mc.start_date as cycle_start_date,
                    mc.end_date as cycle_end_date
                FROM period_summary ps
                LEFT JOIN menstrual_cycles mc ON ps.cycle_id = mc.id
                WHERE ps.user_id = ? 
                  AND (
                    ps.start_date BETWEEN ? AND ?
                    OR ps.end_date BETWEEN ? AND ?
                    OR (ps.start_date <= ? AND (ps.end_date IS NULL OR ps.end_date >= ?))
                  )
                ORDER BY ps.start_date`,
                [userId, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate]
            );
            reportData.periods = periods;
        }

        // Calculate summary statistics
        const summary = {
            date_range: {
                start: formattedStartDate,
                end: formattedEndDate,
                total_days: moment(formattedEndDate).diff(moment(formattedStartDate), 'days') + 1
            },
            notes_count: reportData.notes ? reportData.notes.length : 0,
            symptoms_count: reportData.symptoms ? reportData.symptoms.length : 0,
            cycles_count: reportData.cycles ? reportData.cycles.length : 0,
            periods_count: reportData.periods ? reportData.periods.length : 0
        };

        // Calculate period statistics
        if (reportData.notes) {
            const periodDays = reportData.notes.filter(n => n.is_period_day);
            summary.period_days = periodDays.length;
            summary.total_pads_used = periodDays.reduce((sum, day) => sum + (day.pads_used || 0), 0);
            summary.average_pads_per_day = periodDays.length > 0 ? 
                Math.round((summary.total_pads_used / periodDays.length) * 100) / 100 : 0;
        }

        res.status(200).json({
            status: 'success',
            data: {
                summary,
                details: reportData
            }
        });

    } catch (error) {
        console.error('Custom report error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

module.exports = router;