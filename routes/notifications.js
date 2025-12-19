const express = require("express");
const router = express.Router();
const db = require("../config/db");
const axios = require("axios");
const rateLimit = require("express-rate-limit");

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;

router.post("/save-token", (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) {
    return res.status(400).json({ error: "Missing userId or token" });
  }

  const sql = `
    INSERT INTO user_tokens (user_id, fcm_token)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)
  `;

  db.query(sql, [userId, token], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: "Token saved/updated" });
  });
});

router.post("/send-notification", (req, res) => {
  const { userIds, title, body } = req.body;
  if (!userIds || !Array.isArray(userIds)) {
    return res.status(400).json({ error: "userIds must be an array" });
  }
  if (!FCM_SERVER_KEY) {
    return res.status(500).json({ error: "FCM_SERVER_KEY not configured" });
  }

  const sql = `SELECT fcm_token FROM user_tokens WHERE user_id IN (?)`;
  const sanitizedUserIds = userIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  db.query(sql, [sanitizedUserIds], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const tokens = results.map(r => r.fcm_token);
    if (tokens.length === 0) return res.status(404).json({ error: "No tokens found" });

    try {
      const chunkArray = (array, size) => {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
          result.push(array.slice(i, i + size));
        }
        return result;
      };

      const tokenBatches = chunkArray(tokens, 1000);
      const responses = [];
      for (const batch of tokenBatches) {
        const response = await axios.post(
          "https://fcm.googleapis.com/fcm/send",
          {
            registration_ids: batch,
            notification: { title, body }
          },
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `key=${FCM_SERVER_KEY}`
            }
          }
        );
        responses.push(response.data);
      }
      res.json({ results: responses });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        details: error.response?.data?.error || "Unknown error",
      });
    }
  });
});

module.exports = router;