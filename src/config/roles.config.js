const ROLES = {
    ADMIN: 'admin',
    STUDENT: 'student',
    WARDEN: 'warden',
    DIRECTOR: 'director',
    AO: 'ao',
    STAFF: 'staff'
  };
  
  const ROLE_HIERARCHY = {
    [ROLES.ADMIN]: 5,
    [ROLES.AO]: 4,
    [ROLES.DIRECTOR]: 3,
    [ROLES.WARDEN]: 2,
    [ROLES.STAFF]: 1,
    [ROLES.STUDENT]: 0
  };
  
  const APPROVAL_FLOW = [
    ROLES.WARDEN,
    ROLES.DIRECTOR,
    ROLES.AO
  ];
  
  module.exports = {
    ROLES,
    ROLE_HIERARCHY,
    APPROVAL_FLOW
  };
  
  