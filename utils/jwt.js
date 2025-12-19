// anujsmit/mensuration_tracker_backend/mensuration_tracker_backend-b270fad9aad702aa4e349ee6e2e2cfd2756512dc/utils/jwt.js

const jwt = require('jsonwebtoken');
require('dotenv').config();

// Load the JWT secret key from environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d'; // Default token expiry is 7 days

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
    // In a production app, you might crash the server if a critical secret is missing.
    // process.exit(1); 
}

/**
 * Generates an access token for a successfully authenticated user.
 * * @param {number} userId - The internal database ID of the user.
 * @param {boolean} isAdmin - Flag indicating if the user is an admin.
 * @returns {string} The signed JWT.
 */
const generateAccessToken = (userId, isAdmin = false) => {
    // The payload contains essential, non-sensitive user information
    const payload = {
        userId: userId,
        isAdmin: isAdmin,
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRY,
        issuer: 'mensuration-tracker-backend'
    });
};

module.exports = {
    generateAccessToken,
    JWT_SECRET
};