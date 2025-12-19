// anujsmit/mensuration_tracker_backend/mensuration_tracker_backend-d901e56da1b664b3f368073c99cdd37dc9374b73/index.js
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const db = require('./config/db'); // Ensure your DB connection is initialized

// Import Route Handlers
const firebaseAuth = require("./routes/auth/firebaseauth"); 
const phoneAuth = require("./routes/auth/phoneAuth");
const users = require("./routes/users");
const profile = require("./routes/profile");
const sendnotification = require("./routes/sendnotification");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

// 1. CORS Configuration for Web Browser
// This allows your Flutter Web app (usually on port 5000+) to talk to the server
app.use(cors({
    origin: '*', // For development, allows any origin. Replace with 'http://localhost:5000' for production.
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Body Parsers (Required for POST/PUT requests)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// ROUTE MOUNTING
// ==========================================

// Create an auth router to match your Flutter 'apiAuthBaseUrl' (/api/auth)
const authRouter = express.Router();

authRouter.use("/firebase", firebaseAuth);    // Points to /api/auth/firebase
authRouter.use("/phone", phoneAuth);          // Points to /api/auth/phone
authRouter.use("/profile", profile);          // Points to /api/auth/profile
authRouter.use("/notification", sendnotification); // Points to /api/auth/notification
authRouter.use("/", users);                    // Points to /api/auth/

// Mount everything under the base path used in Flutter Config
app.use("/api/auth", authRouter);

// Health Check Route
app.get("/", (req, res) => {
    res.send("Mensuration Tracker Backend is running...");
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================

// Listening on 0.0.0.0 is crucial for local network/emulator access
app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------------`);
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`API Base URL: http://localhost:${PORT}/api/auth`);
    console.log(`-----------------------------------------------`);
});