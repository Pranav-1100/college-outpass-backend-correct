const { auth, db } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');
const { sendError } = require('../utils/response.util');

// Role mapping dictionary for compatibility
const ROLE_MAPPING = {
  'director': 'campus_admin',
  'ao': 'os'
};

// Reverse role mapping (for database queries)
const REVERSE_ROLE_MAPPING = {
  'campus_admin': ['campus_admin', 'director'],
  'os': ['os', 'ao']
};

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
      
      // Map old role names to new role names
      let role = decodedToken.role || 'student';
      
      // Apply role name mapping
      if (ROLE_MAPPING[role]) {
        const oldRole = role;
        role = ROLE_MAPPING[role];
        console.log(`Mapped ${oldRole} role to ${role}`);
      }
      
      // Add user info to request
      req.user = {
        uid: decodedToken.uid || decodedToken.user_id,
        email: decodedToken.email,
        name: decodedToken.name, // Make sure this is included
        role: role,
        originalRole: decodedToken.role // Keep the original role for reference
      };
      
      console.log(`User authenticated with role: ${req.user.role}`);
      
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

    // Expand the allowed roles to include both old and new names
    const expandedAllowedRoles = [];
    
    for (const role of allowedRoles) {
      if (role) {
        expandedAllowedRoles.push(role);
        
        // Also add the old role name if this is a new role name
        // For example, if 'campus_admin' is allowed, also allow 'director'
        if (role === 'campus_admin') expandedAllowedRoles.push('director');
        if (role === 'os') expandedAllowedRoles.push('ao');
        
        // And add the new role name if this is an old role name
        // For example, if 'director' is allowed, also allow 'campus_admin'
        if (role === 'director') expandedAllowedRoles.push('campus_admin');
        if (role === 'ao') expandedAllowedRoles.push('os');
      }
    }

    console.log(`Checking if user role ${req.user.role} is in allowed roles:`, expandedAllowedRoles);
    
    if (!expandedAllowedRoles.includes(req.user.role) && !expandedAllowedRoles.includes(req.user.originalRole)) {
      return sendError(res, 403, 'Insufficient permissions');
    }

    next();
  };
};

// Helper function to get compatible roles for database queries
const getCompatibleRoles = (role) => {
  if (REVERSE_ROLE_MAPPING[role]) {
    return REVERSE_ROLE_MAPPING[role];
  }
  
  // If no mapping exists, just return the role itself
  return [role];
};

module.exports = {
  verifyAuth,
  isAdmin,
  hasRole,
  getCompatibleRoles,
  ROLE_MAPPING,
  REVERSE_ROLE_MAPPING
};