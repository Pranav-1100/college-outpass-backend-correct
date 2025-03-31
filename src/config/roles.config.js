// src/config/roles.config.js
const ROLES = {
  ADMIN: 'admin',
  STUDENT: 'student',
  WARDEN: 'warden',
  CAMPUS_ADMIN: 'campus_admin', // Changed from DIRECTOR
  OS: 'os', // Changed from AO (Academic Officer to Office Staff)
  STAFF: 'staff'
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 5,
  [ROLES.OS]: 4,
  [ROLES.CAMPUS_ADMIN]: 3,
  [ROLES.WARDEN]: 2,
  [ROLES.STAFF]: 1,
  [ROLES.STUDENT]: 0
};

const APPROVAL_FLOW = [
  ROLES.WARDEN,
  ROLES.CAMPUS_ADMIN,
  ROLES.OS
];

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  APPROVAL_FLOW
};