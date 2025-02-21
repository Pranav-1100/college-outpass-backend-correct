const { auth } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');
const { sendError } = require('../utils/response.util');

const verifyAuth = async (req, res, next) => {
  try {
    // Check if authorization header exists
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return sendError(res, 401, 'No authorization header');
    }

    // Check if it starts with Bearer
    if (!authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Invalid authorization format');
    }

    const token = authHeader.split('Bearer ')[1];
    console.log('Verifying token:', token); // Debug log

    try {
      const decodedToken = await auth.verifyIdToken(token);
      console.log('Decoded token:', decodedToken); // Debug log
      
      // Add user info to request
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name, // Make sure this is included
        role: decodedToken.role || 'student'
      };      
      
      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      return sendError(res, 401, 'Invalid token');
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return sendError(res, 500, 'Authentication failed');
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 401, 'User not authenticated');
  }

  if (req.user.role !== ROLES.ADMIN) {
    return sendError(res, 403, 'Admin access required');
  }

  next();
};

const hasRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'User not authenticated');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, 'Insufficient permissions');
    }

    next();
  };
};

module.exports = {
  verifyAuth,
  isAdmin,
  hasRole
};