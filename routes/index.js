const express = require("express");
const cors = require("cors");

const firebaseAuth = require("./routes/auth/firebaseauth"); 
const phoneAuth = require("./routes/auth/phoneAuth");
// const login = require("./routes/auth/login"); // REMOVED: Replaced by passwordReset for admin/legacy users
const users = require("./routes/auth/users");
const profile = require("./routes/auth/profile");
const sendnotification = require("./routes/auth/sendnotification");
const passwordReset = require("./routes/passwordReset"); // Added passwordReset

const router = express.Router();

router.use(cors());

// Route definitions (Mounted under /api/auth in the main application)
router.use("/firebase", firebaseAuth); // Google auth - /api/auth/firebase
router.use("/phone", phoneAuth); // Phone OTP auth - /api/auth/phone
// Removed /login, /signup, /verify-otp routes.
router.use("/", users); // User management - /api/auth/ (GET/PUT/DELETE /api/auth/users)
router.use("/profile", profile); // Profile - /api/auth/profile
router.use("/notification", sendnotification); // FIX: Renamed route to /notification 
router.use("/", passwordReset); // Password Reset - /api/auth/request, /api/auth/verify-otp, /api/auth/set-password

module.exports = router;