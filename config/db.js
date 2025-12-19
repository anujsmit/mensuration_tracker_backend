// anujsmit/mensuration_tracker_backend/mensuration_tracker_backend-b270fad9aad702aa4e349ee6e2e2cfd2756512dc/config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+05:30' // Set timezone to IST (UTC+05:30)
});

// Test the database connection
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to the database.');
        connection.release(); // Release the connection
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
        process.exit(1); // Exit the process if database connection fails
    });

module.exports = pool;