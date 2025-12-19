const jwt = require('jsonwebtoken');
const db = require('../config/db');
const rateLimit = require('express-rate-limit');

// Rate limiting for authentication attempts
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many authentication attempts from this IP, please try again later',
  skipSuccessfulRequests: true // only count failed attempts
});

module.exports = {
  // General authentication middleware (for all users)
  authenticateUser: async (req, res, next) => {
    try {
      // 1. Get token from header
      const authHeader = req.header('Authorization');
      if (!authHeader) {
        return res.status(401).json({ 
          status: 'error', 
          message: 'Authorization header missing',
          code: 'MISSING_AUTH_HEADER'
        });
      }

      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ 
          status: 'error', 
          message: 'No token provided',
          code: 'NO_TOKEN'
        });
      }

      // 2. Verify token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            status: 'error', 
            message: 'Token expired',
            code: 'TOKEN_EXPIRED'
          });
        }
        return res.status(401).json({ 
          status: 'error', 
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      // 3. Check if user exists
      const [users] = await db.execute(
        'SELECT id, email, isadmin, verified FROM users WHERE id = ?',
        [decoded.userId]
      ).catch(err => {
        console.error('Database error:', err);
        throw new Error('Database operation failed');
      });
      
      if (users.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'User account not found or may have been deleted',
          code: 'USER_NOT_FOUND'
        });
      }

      const user = users[0];

      // 4. Check if account is verified (if required)
      if (req.requireVerified && !user.verified) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Account not verified. Please verify your email.',
          code: 'UNVERIFIED_ACCOUNT'
        });
      }

      // 5. Add user to request
      req.user = {
        userId: user.id,
        email: user.email,
        isAdmin: user.isadmin || false,
        verified: user.verified || false
      };

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Authentication failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Admin-specific authentication middleware
  authenticateAdmin: async (req, res, next) => {
    try {
      // First authenticate as a user
      await module.exports.authenticateUser(req, res, () => {});

      // Then check if user is admin
      if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Admin privileges required',
          code: 'ADMIN_REQUIRED'
        });
      }

      next();
    } catch (error) {
      console.error('Admin authentication error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Admin authentication failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },
  authRateLimiter
};