require('dotenv').config();
const express = require("express");
const cors = require("cors");
const db = require('./config/db');
const firebaseAuth = require("./routes/auth/firebaseauth");
const phoneAuth = require("./routes/auth/phoneAuth");
const users = require("./routes/users");
const profile = require("./routes/profile");
const sendnotification = require("./routes/sendnotification");
const notesRoutes = require('./routes/notes');
const reportsRoutes = require('./routes/report');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const authRouter = express.Router();
authRouter.use("/firebase", firebaseAuth);
authRouter.use("/phone", phoneAuth);
authRouter.use("/profile", profile);
authRouter.use("/notification", sendnotification);
authRouter.use("/", users);
authRouter.use("/notes", notesRoutes);
authRouter.use("/reports", reportsRoutes);
app.use("/api/auth", authRouter);


app.get("/", (req, res) => {
    res.send("Mensuration Tracker Backend is running...");
});
app.use((req, res, next) => {
    res.status(404).json({
        status: 'error',
        message: `Route ${req.originalUrl} not found`
    });
});



app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------------`);
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`API Base URL: http://localhost:${PORT}/api/auth`);
    console.log(`Available Routes:`);
    console.log(`  • /api/auth/firebase/*`);
    console.log(`  • /api/auth/phone/*`);
    console.log(`  • /api/auth/profile/*`);
    console.log(`  • /api/auth/notification/*`);
    console.log(`  • /api/auth/notes/*`);
    console.log(`  • /api/auth/reports/*`);
    console.log(`-----------------------------------------------`);
});