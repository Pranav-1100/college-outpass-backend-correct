// src/services/outpass.service.js
const { db, auth, admin } = require('../config/firebase.config');
const { ROLES, APPROVAL_FLOW } = require('../config/roles.config');
const notificationService = require('./notification.service');
const studentService = require('./student.service');
const { getCompatibleRoles, ROLE_MAPPING } = require('../middlewares/auth.middleware');


// Define leave types constants
const LEAVE_TYPES = {
  SHORT_LEAVE: 'short_leave',
  LONG_LEAVE: 'long_leave',
  VACATION: 'vacation',
  ACADEMIC: 'academic',
  NON_ACADEMIC: 'non_academic'
};

// Define approval flows by leave type
const APPROVAL_FLOWS = {
  [LEAVE_TYPES.ACADEMIC]: [ROLES.WARDEN, ROLES.OS],
  [LEAVE_TYPES.NON_ACADEMIC]: [ROLES.WARDEN, ROLES.CAMPUS_ADMIN],
  [LEAVE_TYPES.LONG_LEAVE]: [ROLES.WARDEN, ROLES.CAMPUS_ADMIN, ROLES.OS],
  [LEAVE_TYPES.SHORT_LEAVE]: [ROLES.WARDEN, ROLES.CAMPUS_ADMIN, ROLES.OS],
  [LEAVE_TYPES.VACATION]: [ROLES.WARDEN, ROLES.CAMPUS_ADMIN, ROLES.OS],
};

const outpassService = {
  // Create new outpass request
  async createRequest(studentId, requestData) {
    try {
      console.log(`Creating outpass for student ID: ${studentId}`);
      
      // Get student details from user document
      const studentDoc = await db.collection('users').doc(studentId).get();
      
      if (!studentDoc.exists) {
        console.error(`Student with ID ${studentId} not found in Firestore`);
        throw new Error('Student not found');
      }

      const userDetails = studentDoc.data();
      
      // Use student data if available, else use provided data
      let studentName = userDetails.name;
      let studentPRN = requestData.prn; 
      let studentEmail = userDetails.email;
      let studentPhone = requestData.studentPhone;
      let fatherName = requestData.fatherName;
      let fatherEmail = requestData.fatherEmail;
      let fatherPhone = requestData.fatherPhone;
      let motherName = requestData.motherName;
      let motherEmail = requestData.motherEmail;
      let motherPhone = requestData.motherPhone;
      let branch = "Unknown";
      let gender = "";
      let school = "";
      let programme = "";
      let yearOfStudy = "";
      
      // Hostel and warden information
      let hostel = null;
      
      // Override with linked student data if available
      if (userDetails.studentData) {
        const studentData = userDetails.studentData;
        
        // Only override if not explicitly provided in request
        studentPRN = studentPRN || studentData.prn;
        studentName = studentName || studentData.name;
        studentEmail = studentEmail || studentData.email;
        studentPhone = studentPhone || studentData.phone;
        fatherName = fatherName || studentData.fatherName;
        fatherEmail = fatherEmail || studentData.fatherEmail;
        fatherPhone = fatherPhone || studentData.fatherPhone;
        motherName = motherName || studentData.motherName;
        motherEmail = motherEmail || studentData.motherEmail;
        motherPhone = motherPhone || studentData.motherPhone;
        branch = studentData.branch || branch;
        gender = studentData.gender || gender;
        school = studentData.school || "";
        programme = studentData.programme || "";
        yearOfStudy = studentData.yearOfStudy || "";
        
        // Add hostel information if available
        if (studentData.hostel) {
          hostel = studentData.hostel;
        }
      }

      // Determine leave type based on duration and request reason
      const fromDate = new Date(requestData.fromDate);
      const toDate = new Date(requestData.toDate);
      const daysDiff = (toDate - fromDate) / (1000 * 60 * 60 * 24);
      
      // Determine base leave type by duration
      let leaveType;
      if (daysDiff <= 1) {
        leaveType = LEAVE_TYPES.SHORT_LEAVE;
      } else if (daysDiff > 1 && daysDiff < 7) {
        leaveType = LEAVE_TYPES.LONG_LEAVE;
      } else {
        leaveType = LEAVE_TYPES.VACATION;
      }
      
      // Determine special leave type based on reason if provided
      if (requestData.leaveCategory) {
        if (requestData.leaveCategory === 'academic') {
          leaveType = LEAVE_TYPES.ACADEMIC;
        } else if (requestData.leaveCategory === 'non_academic') {
          leaveType = LEAVE_TYPES.NON_ACADEMIC;
        }
      }
      
      // Get the approval flow for this leave type
      let approvalFlow = APPROVAL_FLOWS[leaveType] || APPROVAL_FLOWS[LEAVE_TYPES.LONG_LEAVE];
      
      // For SCMS students, auto-approve the OS step
      const isScmsStudent = studentEmail && studentEmail.includes('@scmshyd.siu.edu.in');
      
      // Generate initial approval statuses
      const approvalStatus = {};
      const approvals = {};
      
      // Initialize all possible approval roles
      // Initialize all possible approval roles
[ROLES.WARDEN, ROLES.CAMPUS_ADMIN, ROLES.OS].forEach(role => {
  // If this role is in the approval flow for this leave type, mark as pending
  // Otherwise, auto-approve (this role is not required for this leave type)
  const isInFlow = approvalFlow.includes(role);
  
  // Auto-approve OS for SCMS students
  if (role === ROLES.OS && isScmsStudent) {
    approvalStatus[role.toLowerCase()] = true;
    approvals[role.toLowerCase()] = {
      status: 'auto_approved',
      timestamp: new Date().toISOString(),
      comments: 'Auto-approved for SCMS students'
    };
  } 
  // Auto-approve WARDEN for all students (TEMPORARY FIX)
  else if (role === ROLES.WARDEN) {
    approvalStatus[role.toLowerCase()] = true;
    approvals[role.toLowerCase()] = {
      status: 'auto_approved',
      timestamp: new Date().toISOString(),
      comments: 'Auto-approved (temporary warden bypass)'
    };
  } else {
    approvalStatus[role.toLowerCase()] = !isInFlow; // Auto-approve if not in flow
    approvals[role.toLowerCase()] = {
      status: isInFlow ? 'pending' : 'auto_approved',
      timestamp: isInFlow ? null : new Date().toISOString(),
      comments: isInFlow ? '' : 'Auto-approved (not required for this leave type)'
    };
  }
});

      const outpassData = {
        studentId,
        studentName,
        studentPRN,
        branch,
        // Add school info
        school,
        programme,
        yearOfStudy,
        gender,
        // Add hostel information
        hostel,
        parentDetails: {
          father: {
            name: fatherName,
            email: fatherEmail,
            phone: fatherPhone
          },
          mother: {
            name: motherName,
            email: motherEmail,
            phone: motherPhone
          }
        },
        studentContact: {
          email: studentEmail,
          phone: studentPhone
        },
        leaveType,
        leaveCategory: requestData.leaveCategory || 'regular',
        purpose: requestData.purpose,
        fromDate: requestData.fromDate,
        toDate: requestData.toDate,
        outTime: requestData.outTime,
        inTime: requestData.inTime,
        destination: requestData.destination,
        approvalFlow,
        currentStatus: 'pending',
        approvalStatus,
        approvals,
        isUsed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Add isScmsStudent flag for reference
        isScmsStudent: isScmsStudent
      };

      const outpassRef = await db.collection('outpasses').add(outpassData);
      console.log(`Outpass created with ID: ${outpassRef.id}`);

      // Notify only the relevant approvers based on the approval flow
      try {
        // Notify specific warden if hostel information is available
        if (hostel && hostel.wardenName) {
          // Try to find warden by name
          const wardenQuery = await db.collection('users')
            .where('name', '==', hostel.wardenName)
            .where('role', '==', ROLES.WARDEN)
            .limit(1)
            .get();
            
          if (!wardenQuery.empty) {
            // Notify specific warden
            const wardenDoc = wardenQuery.docs[0];
            await notificationService.notifyUser(
              wardenDoc.id,
              `New Outpass Request`,
              `New ${leaveType.replace('_', ' ')} request from ${studentName}`
            );
          } else {
            // Fall back to notifying all wardens if specific one not found
            await notificationService.notifyRole(
              ROLES.WARDEN,
              `New ${leaveType.replace('_', ' ')} Request`,
              `New ${leaveType.replace('_', ' ')} request from ${studentName}`
            );
          }
        } else {
          // Notify all wardens if no specific warden
          await notificationService.notifyRole(
            ROLES.WARDEN,
            `New ${leaveType.replace('_', ' ')} Request`,
            `New ${leaveType.replace('_', ' ')} request from ${studentName}`
          );
        }
        
        // Notify campus admin (always)
        if (approvalFlow.includes(ROLES.CAMPUS_ADMIN)) {
          await notificationService.notifyRole(
            ROLES.CAMPUS_ADMIN,
            `New ${leaveType.replace('_', ' ')} Request`,
            `New ${leaveType.replace('_', ' ')} request from ${studentName}`
          );
        }
        
        // Notify OS (if not SCMS and in approval flow)
        if (approvalFlow.includes(ROLES.OS) && !isScmsStudent) {
          // Check if we can find an OS specific to this school
          let osQuery;
          
          if (school && school.includes('SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES')) {
            // SCMS office staff (though we auto-approve, still notify)
            osQuery = await db.collection('users')
              .where('email', '==', 'os@scmshyd.siu.edu.in')
              .limit(1)
              .get();
          } else if (school && school.includes('SYMBIOSIS INSTITUTE OF TECHNOLOGY')) {
            // SITHYD office staff
            osQuery = await db.collection('users')
              .where('email', '==', 'ao@sithyd.siu.edu.in')
              .limit(1)
              .get();
          }
          
          if (osQuery && !osQuery.empty) {
            // Notify specific OS
            const osDoc = osQuery.docs[0];
            await notificationService.notifyUser(
              osDoc.id,
              `New Outpass Request`,
              `New ${leaveType.replace('_', ' ')} request from ${studentName}`
            );
          } else {
            // Fall back to notifying all OS
            await notificationService.notifyRole(
              ROLES.OS,
              `New ${leaveType.replace('_', ' ')} Request`,
              `New ${leaveType.replace('_', ' ')} request from ${studentName}`
            );
          }
        }
      } catch (notifyError) {
        console.error('Error sending notifications:', notifyError);
      }

      return {
        id: outpassRef.id,
        ...outpassData
      };
    } catch (error) {
      console.error('Error creating outpass request:', error);
      throw error;
    }
  },

  // Process approval/rejection - Modified for custom approval flows
  async processApproval(outpassId, approverData, decision, comments) {
    try {
      const outpassRef = db.collection('outpasses').doc(outpassId);
      const outpassDoc = await outpassRef.get();
  
      if (!outpassDoc.exists) {
        throw new Error('Outpass not found');
      }
  
      const outpassData = outpassDoc.data();
      
      // Map old role names to new role names if needed
      let approverRole = approverData.role.toLowerCase();
      const originalRole = approverData.originalRole ? approverData.originalRole.toLowerCase() : null;
      
      // Use the role mapping from auth middleware
      if (ROLE_MAPPING && ROLE_MAPPING[approverRole]) {
        approverRole = ROLE_MAPPING[approverRole];
      }
      
      // Also check original role for backward compatibility
      if (originalRole && ROLE_MAPPING && ROLE_MAPPING[originalRole]) {
        const mappedOriginalRole = ROLE_MAPPING[originalRole];
        // If the mapped original role is different from approver role, we'll check both
        if (mappedOriginalRole !== approverRole) {
          console.log(`Using mapped original role: ${originalRole} -> ${mappedOriginalRole}`);
        }
      }
      
      // For wardens, check if they're allowed to approve this student's outpass
      if (approverRole === ROLES.WARDEN.toLowerCase()) {
        // If outpass has hostel info with warden name
        if (outpassData.hostel && outpassData.hostel.wardenName) {
          // Check if this warden is the student's assigned warden
          if (outpassData.hostel.wardenName !== approverData.name) {
            console.error(`Warden ${approverData.name} is not authorized to approve outpass for student with warden ${outpassData.hostel.wardenName}`);
            throw new Error('You are not authorized to approve/reject this outpass as you are not the assigned warden for this student');
          }
        }
      }
      
      // For OS, check if they're allowed to approve this student's outpass
      if (approverRole === ROLES.OS.toLowerCase()) {
        // If there's a school and it's SCMS, it should be auto-approved
        if (outpassData.isScmsStudent || 
            (outpassData.school && outpassData.school.includes('SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES'))) {
          console.error(`This outpass is for a SCMS student and the OS step should be auto-approved`);
          throw new Error('This outpass is for a SCMS student and the OS step should be auto-approved');
        }
        
        // For SITHYD, only the SITHYD OS should approve
        if (outpassData.school && outpassData.school.includes('SYMBIOSIS INSTITUTE OF TECHNOLOGY')) {
          // Check if this OS is from SITHYD
          if (approverData.email !== 'ao@sithyd.siu.edu.in') {
            console.error(`OS ${approverData.email} is not authorized to approve SITHYD student outpass`);
            throw new Error('You are not authorized to approve/reject this outpass as you are not the assigned OS for this school');
          }
        }
      }
  
      // Check if this role is in the approval flow for this leave type
      // Start by getting the approval flow - handle both old and new formats
      let approvalFlow = outpassData.approvalFlow;
      
      // If no approvalFlow specified, use the default based on leave type
      if (!approvalFlow) {
        // Default to standard approval flow if nothing else is specified
        approvalFlow = APPROVAL_FLOWS?.[outpassData.leaveType] || 
                       [ROLES.WARDEN, ROLES.CAMPUS_ADMIN, ROLES.OS];
      }
      
      console.log(`Approval flow for outpass ${outpassId}:`, approvalFlow);
      console.log(`Checking if ${approverRole} is in approval flow`);
      
      // Convert approval flow roles to lowercase for comparison
      const lowerCaseApprovalFlow = approvalFlow.map(role => 
        typeof role === 'string' ? role.toLowerCase() : role
      );
      
      // Create a list of all possible role variations to check (old and new names)
      const roleVariationsToCheck = [approverRole];
      
      // Add backward compatibility checks for old role names
      if (approverRole === 'campus_admin') roleVariationsToCheck.push('director');
      if (approverRole === 'os') roleVariationsToCheck.push('ao');
      
      // Add forward compatibility checks for new role names
      if (approverRole === 'director') roleVariationsToCheck.push('campus_admin');
      if (approverRole === 'ao') roleVariationsToCheck.push('os');
      
      // Also add the original role if provided
      if (originalRole && !roleVariationsToCheck.includes(originalRole)) {
        roleVariationsToCheck.push(originalRole);
      }
      
      console.log('Checking role variations:', roleVariationsToCheck);
      
      // Check if any of our role variations are in the approval flow
      const isInFlow = roleVariationsToCheck.some(roleVariant => 
        lowerCaseApprovalFlow.includes(roleVariant) || // Check lowercase role name
        lowerCaseApprovalFlow.includes(roleVariant.toUpperCase()) // Check uppercase role name
      );
      
      // For admin users, always allow them to bypass flow restrictions
      const isAdmin = approverRole === ROLES.ADMIN || approverRole === 'admin';
      
      if (!isInFlow && !isAdmin) {
        console.error(`Role ${approverRole} not in approval flow:`, lowerCaseApprovalFlow);
        throw new Error(`You (${approverRole}) are not authorized to approve/reject this type of leave`);
      }
  
      // Update approval status
      const approval = {
        status: decision,
        timestamp: new Date().toISOString(),
        approverId: approverData.uid,
        approverName: approverData.name || approverData.email || 'Unknown User',
        comments
      };
  
      // Determine which field to update based on the role
      let roleKey = approverRole;
      
      // If the old role fields exist in the document, update those instead
      // to maintain compatibility with existing data
      if (approverRole === 'campus_admin' && outpassData.approvals.director) {
        roleKey = 'director';
      } else if (approverRole === 'os' && outpassData.approvals.ao) {
        roleKey = 'ao';
      }
  
      // Update specific role's approval
      const updates = {
        [`approvals.${roleKey}`]: approval,
        [`approvalStatus.${roleKey}`]: decision === 'approved',
        updatedAt: new Date().toISOString()
      };
  
      // If rejected, update overall status
      if (decision === 'rejected') {
        updates.currentStatus = 'rejected';
      } else {
        // Check if all required approvers have approved
        const newApprovalStatus = {
          ...outpassData.approvalStatus,
          [roleKey]: true
        };
        
        // For backward compatibility, also check fields with old role names
        if (roleKey === 'campus_admin') {
          newApprovalStatus.director = true;
        } else if (roleKey === 'director') {
          newApprovalStatus.campus_admin = true;
        } else if (roleKey === 'os') {
          newApprovalStatus.ao = true;
        } else if (roleKey === 'ao') {
          newApprovalStatus.os = true;
        }
        
        // Only check approval status for roles in this leave's approval flow
        // Create a list of fields to check (use both old and new role names)
        const fieldsToCheck = [];
        
        for (const role of approvalFlow) {
          const roleLower = typeof role === 'string' ? role.toLowerCase() : null;
          if (roleLower === 'warden') fieldsToCheck.push('warden');
          else if (roleLower === 'campus_admin' || roleLower === 'director') {
            fieldsToCheck.push('campus_admin', 'director');
          }
          else if (roleLower === 'os' || roleLower === 'ao') {
            fieldsToCheck.push('os', 'ao');
          }
        }
        
        // Remove duplicates from fieldsToCheck
        const uniqueFieldsToCheck = [...new Set(fieldsToCheck)];
        console.log('Checking approval status for fields:', uniqueFieldsToCheck);
        
        // For each role type (warden, campus_admin/director, os/ao), check if any of the fields are approved
        const roleTypeApproval = {
          warden: uniqueFieldsToCheck.includes('warden') ? newApprovalStatus.warden : true,
          campus_admin_or_director: uniqueFieldsToCheck.includes('campus_admin') || uniqueFieldsToCheck.includes('director') 
            ? (newApprovalStatus.campus_admin || newApprovalStatus.director) : true,
          os_or_ao: uniqueFieldsToCheck.includes('os') || uniqueFieldsToCheck.includes('ao')
            ? (newApprovalStatus.os || newApprovalStatus.ao) : true
        };
        
        console.log('Role type approval status:', roleTypeApproval);
        
        const allApproved = Object.values(roleTypeApproval).every(status => status === true);
        
        if (allApproved) {
          updates.currentStatus = 'approved';
        }
      }
  
      // Update outpass document
      await outpassRef.update(updates);
  
      // Format role name for notifications
      let formattedRoleName;
      if (roleKey === 'campus_admin' || roleKey === 'director') {
        formattedRoleName = 'Campus Admin';
      } else if (roleKey === 'os' || roleKey === 'ao') {
        formattedRoleName = 'Office Staff';
      } else {
        formattedRoleName = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
      }
  
      // Send notifications based on new status
      if (updates.currentStatus === 'approved') {
        await notificationService.notifyUser(
          outpassData.studentId,
          'Outpass Approved',
          'Your outpass has been approved by all approvers!'
        );
      } else if (updates.currentStatus === 'rejected') {
        await notificationService.notifyUser(
          outpassData.studentId,
          'Outpass Rejected',
          `Your outpass was rejected by ${formattedRoleName}`
        );
      } else {
        // Notify student of individual approval
        await notificationService.notifyUser(
          outpassData.studentId,
          'Outpass Update',
          `Your outpass has been approved by ${formattedRoleName}`
        );
      }
  
      return {
        id: outpassId,
        status: updates.currentStatus || 'pending'
      };
    } catch (error) {
      console.error('Error processing approval:', error);
      throw error;
    }
  },

  // Get outpass details - no changes needed
  async getOutpass(outpassId) {
    try {
      const outpassDoc = await db.collection('outpasses').doc(outpassId).get();
      if (!outpassDoc.exists) {
        throw new Error('Outpass not found');
      }

      return {
        id: outpassDoc.id,
        ...outpassDoc.data()
      };
    } catch (error) {
      console.error('Error getting outpass:', error);
      throw error;
    }
  },

  // Get outpasses by student - no changes needed
  async getStudentOutpasses(studentId) {
    try {
      const outpassesSnapshot = await db.collection('outpasses')
        .where('studentId', '==', studentId)
        .orderBy('createdAt', 'desc')
        .get();

      const outpasses = [];
      outpassesSnapshot.forEach(doc => {
        outpasses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return outpasses;
    } catch (error) {
      console.error('Error getting student outpasses:', error);
      throw error;
    }
  },

  // Get pending approvals for role - Updated for warden/school specific
  async getPendingApprovals(role, userInfo) {
    try {
      console.log('Getting pending approvals for role:', role);
      
      // Map old role names to new role names if needed
      let roleKey = role.toLowerCase();
      if (ROLE_MAPPING[roleKey]) {
        roleKey = ROLE_MAPPING[roleKey];
      }
      
      // Get all compatible roles (both old and new names)
      const compatibleRoles = getCompatibleRoles(roleKey);
      
      console.log('Looking for pending approvals with compatible roles:', compatibleRoles);
      
      // Initialize array for all pending outpasses
      const outpasses = [];
      
      // Check for each compatible role
      for (const roleVariant of compatibleRoles) {
        const fieldPath = `approvals.${roleVariant}.status`;
        let snapshot;
        
        // Query for this specific role variant, with additional filters for wardens and OS
        if (roleVariant === 'warden' && userInfo && userInfo.name) {
          // For wardens, only show outpasses for students in their hostel
          snapshot = await db.collection('outpasses')
            .where(fieldPath, '==', 'pending')
            .where('currentStatus', '!=', 'rejected')
            .where('hostel.wardenName', '==', userInfo.name)
            .orderBy('currentStatus')
            .orderBy('createdAt', 'desc')
            .get();
        } else if ((roleVariant === 'os' || roleVariant === 'ao') && userInfo && userInfo.email) {
          // For OS, filter by school
          if (userInfo.email === 'ao@sithyd.siu.edu.in') {
            // SITHYD OS
            snapshot = await db.collection('outpasses')
              .where(fieldPath, '==', 'pending')
              .where('currentStatus', '!=', 'rejected')
              .where('school', '==', 'Symbiosis Institute of Technology(SIT), Hyderabad')
              .orderBy('currentStatus')
              .orderBy('createdAt', 'desc')
              .get();
          } else if (userInfo.email === 'os@scmshyd.siu.edu.in') {
            // SCMS OS - should be auto-approved, but include check anyway
            snapshot = await db.collection('outpasses')
              .where(fieldPath, '==', 'pending')
              .where('currentStatus', '!=', 'rejected')
              .where('school', '==', 'SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES, HYDERABAD')
              .orderBy('currentStatus')
              .orderBy('createdAt', 'desc')
              .get();
          } else {
            // Default query for other OS
            snapshot = await db.collection('outpasses')
              .where(fieldPath, '==', 'pending')
              .where('currentStatus', '!=', 'rejected')
              .orderBy('currentStatus')
              .orderBy('createdAt', 'desc')
              .get();
          }
        } else {
          // Standard query for other roles (campus_admin, etc.)
          snapshot = await db.collection('outpasses')
            .where(fieldPath, '==', 'pending')
            .where('currentStatus', '!=', 'rejected')
            .orderBy('currentStatus')
            .orderBy('createdAt', 'desc')
            .get();
        }
        
        console.log(`Found ${snapshot.size} pending outpasses for role variant: ${roleVariant}`);
        
        // Add results to our collection
        snapshot.forEach(doc => {
          // Check if this outpass is already in our results (avoid duplicates)
          const exists = outpasses.some(existing => existing.id === doc.id);
          if (!exists) {
            outpasses.push({
              id: doc.id,
              ...doc.data()
            });
          }
        });
      }
  
      return outpasses;
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      throw error;
    }
  },

  // Get approval history for staff - Updated for warden/school specific
  async getApprovalHistory(role, userInfo) {
    try {
      console.log('Getting approval history for role:', role);
      
      // Map old role names to new role names if needed
      let roleKey = role.toLowerCase();
      if (ROLE_MAPPING[roleKey]) {
        roleKey = ROLE_MAPPING[roleKey];
      }
      
      // Get all compatible roles (both old and new names)
      const compatibleRoles = getCompatibleRoles(roleKey);
      
      console.log('Looking for approval history with compatible roles:', compatibleRoles);
      
      // Initialize array for all outpasses
      const outpasses = [];
      
      // Check for each compatible role
      for (const roleVariant of compatibleRoles) {
        let snapshot;
        
        // Add role-specific filtering
        if (roleVariant === 'warden' && userInfo && userInfo.name) {
          // For wardens, only show outpasses for students in their hostel
          snapshot = await db.collection('outpasses')
            .where(`approvals.${roleVariant}.status`, 'in', ['approved', 'rejected'])
            .where('hostel.wardenName', '==', userInfo.name)
            .orderBy(`approvals.${roleVariant}.timestamp`, 'desc')
            .get();
        } else if ((roleVariant === 'os' || roleVariant === 'ao') && userInfo && userInfo.email) {
          // For OS, filter by school
          if (userInfo.email === 'ao@sithyd.siu.edu.in') {
            // SITHYD OS
            snapshot = await db.collection('outpasses')
              .where(`approvals.${roleVariant}.status`, 'in', ['approved', 'rejected'])
              .where('school', '==', 'Symbiosis Institute of Technology(SIT), Hyderabad')
              .orderBy(`approvals.${roleVariant}.timestamp`, 'desc')
              .get();
          } else if (userInfo.email === 'os@scmshyd.siu.edu.in') {
            // SCMS OS
            snapshot = await db.collection('outpasses')
              .where(`approvals.${roleVariant}.status`, 'in', ['approved', 'rejected'])
              .where('school', '==', 'SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES, HYDERABAD')
              .orderBy(`approvals.${roleVariant}.timestamp`, 'desc')
              .get();
          } else {
            // Default query for other OS
            snapshot = await db.collection('outpasses')
              .where(`approvals.${roleVariant}.status`, 'in', ['approved', 'rejected'])
              .orderBy(`approvals.${roleVariant}.timestamp`, 'desc')
              .get();
          }
        } else {
          // Standard query for other roles (campus_admin, etc.)
          snapshot = await db.collection('outpasses')
            .where(`approvals.${roleVariant}.status`, 'in', ['approved', 'rejected'])
            .orderBy('createdAt', 'desc')
            .get();
        }
          
        console.log(`Found ${snapshot.size} outpasses for role variant: ${roleVariant}`);
        
        // Process outpasses
        snapshot.forEach(doc => {
          const data = doc.data();
          
          // Check if this outpass is already in our results
          const exists = outpasses.some(existing => existing.id === doc.id);
          
          // Only include outpasses where this role was involved (not auto-approved)
          if (!exists && data.approvals[roleVariant] && 
              data.approvals[roleVariant].timestamp && 
              data.approvals[roleVariant].status !== 'auto_approved') {
            
            outpasses.push({
              id: doc.id,
              studentDetails: {
                name: data.studentName,
                prn: data.studentPRN,
                branch: data.branch || 'Unknown',
                school: data.school || 'Unknown',
                gender: data.gender || '',
                contact: data.studentContact,
                // Include hostel information
                hostel: data.hostel || null,
                parentDetails: data.parentDetails || {
                  father: {
                    name: null,
                    email: null,
                    phone: null
                  },
                  mother: {
                    name: null,
                    email: null,
                    phone: null
                  }
                }
              },
              leaveDetails: {
                type: data.leaveType,
                category: data.leaveCategory || 'regular',
                purpose: data.purpose,
                destination: data.destination,
                fromDate: data.fromDate,
                toDate: data.toDate,
                outTime: data.outTime,
                inTime: data.inTime,
                approvalFlow: data.approvalFlow || ['UNKNOWN']
              },
              approvalDetails: {
                // Your role's approval
                myDecision: {
                  status: data.approvals[roleVariant].status,
                  timestamp: data.approvals[roleVariant].timestamp,
                  comments: data.approvals[roleVariant].comments || ''
                },
                // Current status
                currentStatus: data.currentStatus,
                // Full approval chain status with compatibility for old field names
                chain: {
                  warden: {
                    status: data.approvals.warden?.status || 'pending',
                    timestamp: data.approvals.warden?.timestamp || null,
                    comments: data.approvals.warden?.comments || '',
                    approverName: data.approvals.warden?.approverName || ''
                  },
                  campus_admin: {
                    status: data.approvals.campus_admin?.status || data.approvals.director?.status || 'pending',
                    timestamp: data.approvals.campus_admin?.timestamp || data.approvals.director?.timestamp || null,
                    comments: data.approvals.campus_admin?.comments || data.approvals.director?.comments || '',
                    approverName: data.approvals.campus_admin?.approverName || data.approvals.director?.approverName || ''
                  },
                  os: {
                    status: data.approvals.os?.status || data.approvals.ao?.status || 'pending',
                    timestamp: data.approvals.os?.timestamp || data.approvals.ao?.timestamp || null,
                    comments: data.approvals.os?.comments || data.approvals.ao?.comments || '',
                    approverName: data.approvals.os?.approverName || data.approvals.ao?.approverName || ''
                  }
                }
              },
              dates: {
                created: data.createdAt,
                updated: data.updatedAt
              },
              isCompleted: data.currentStatus === 'approved' || data.currentStatus === 'rejected',
              finalStatus: getFinalStatus(data.currentStatus)
            });
          }
        });
      }
  
      // Sort by your approval timestamp, most recent first
      outpasses.sort((a, b) => {
        return new Date(b.approvalDetails.myDecision.timestamp) - 
               new Date(a.approvalDetails.myDecision.timestamp);
      });
  
      console.log(`Returning ${outpasses.length} processed outpasses`);
      return outpasses;
    } catch (error) {
      console.error('Error in getApprovalHistory:', error);
      throw new Error(`Failed to get approval history: ${error.message}`);
    }
  },

  // Get outpasses for a specific warden's hostel
  async getWardenHostelOutpasses(wardenName, status = null) {
    try {
      let query = db.collection('outpasses')
        .where('hostel.wardenName', '==', wardenName);
      
      // Add status filter if provided
      if (status) {
        query = query.where('currentStatus', '==', status);
      }
      
      const snapshot = await query.orderBy('createdAt', 'desc').get();
      
      const outpasses = [];
      snapshot.forEach(doc => {
        outpasses.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return outpasses;
    } catch (error) {
      console.error('Error getting hostel outpasses:', error);
      throw error;
    }
  },
  
  // Get outpasses for a specific school
  async getSchoolOutpasses(school, status = null) {
    try {
      let query = db.collection('outpasses')
        .where('school', '==', school);
      
      // Add status filter if provided
      if (status) {
        query = query.where('currentStatus', '==', status);
      }
      
      const snapshot = await query.orderBy('createdAt', 'desc').get();
      
      const outpasses = [];
      snapshot.forEach(doc => {
        outpasses.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return outpasses;
    } catch (error) {
      console.error('Error getting school outpasses:', error);
      throw error;
    }
  },

  // Add a method to set up real-time listeners - minor updates for approval flows
  async setupRealTimeListeners() {
    try {
      // Listen for new outpass requests
      db.collection('outpasses')
        .where('currentStatus', '==', 'pending')
        .onSnapshot(async (snapshot) => {
          const changes = snapshot.docChanges();
          
          for (const change of changes) {
            if (change.type === 'added') {
              const outpass = change.doc.data();
              
              // Get the approval flow for this outpass
              const approvalFlow = outpass.approvalFlow || 
                APPROVAL_FLOWS[outpass.leaveType] || 
                APPROVAL_FLOWS[LEAVE_TYPES.LONG_LEAVE];
              
              // Notify only the relevant approvers based on the approval flow
              const notificationPromises = approvalFlow.map(role => 
                notificationService.notifyRole(
                  role,
                  `New ${outpass.leaveType.replace('_', ' ')} Request`,
                  `New ${outpass.leaveType.replace('_', ' ')} request from ${outpass.studentName}`
                )
              );
              
              await Promise.all(notificationPromises);
            }
          }
        }, error => {
          console.error('Error in outpass listener:', error);
        });
  
      // Listen for status changes
      db.collection('outpasses')
        .onSnapshot(async (snapshot) => {
          const changes = snapshot.docChanges();
          
          for (const change of changes) {
            if (change.type === 'modified') {
              const outpassData = change.doc.data();
              
              // Notify student of status change
              if (outpassData.studentId) {
                // Notify for final statuses
                if (outpassData.currentStatus === 'approved') {
                  await notificationService.notifyUser(
                    outpassData.studentId,
                    'Outpass Approved',
                    'Your outpass has been approved by all required approvers!'
                  );
                } else if (outpassData.currentStatus === 'rejected') {
                  // Find who rejected it
                  let rejecter = 'A staff member';
                  if (outpassData.approvals.warden?.status === 'rejected') {
                    rejecter = 'Warden';
                  } else if (outpassData.approvals.campus_admin?.status === 'rejected' || 
                            outpassData.approvals.director?.status === 'rejected') {
                    rejecter = 'Campus Admin';
                  } else if (outpassData.approvals.os?.status === 'rejected' ||
                            outpassData.approvals.ao?.status === 'rejected') {
                    rejecter = 'Office Staff';
                  }
                  
                  await notificationService.notifyUser(
                    outpassData.studentId,
                    'Outpass Rejected',
                    `Your outpass request was rejected by ${rejecter}`
                  );
                } else {
                  // For individual approvals, check notification log to avoid duplicates
                  
                  if (outpassData.approvals.warden?.status === 'approved') {
                    // Check if we have already notified for this approval
                    const notifyRef = db.collection('notificationLog')
                      .doc(`${change.doc.id}_warden_approval`);
                    
                    const notifyDoc = await notifyRef.get();
                    if (!notifyDoc.exists) {
                      await notificationService.notifyUser(
                        outpassData.studentId,
                        'Outpass Update',
                        'Warden has approved your outpass.'
                      );
                      
                      // Log that we've sent this notification
                      await notifyRef.set({
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        type: 'warden_approval',
                        outpassId: change.doc.id
                      });
                    }
                  }
                  
                  if (outpassData.approvals.campus_admin?.status === 'approved' || 
                      outpassData.approvals.director?.status === 'approved') {
                    
                    // Check if we have already notified for this approval
                    const notifyRef = db.collection('notificationLog')
                      .doc(`${change.doc.id}_campus_admin_approval`);
                    
                    const notifyDoc = await notifyRef.get();
                    if (!notifyDoc.exists) {
                      await notificationService.notifyUser(
                        outpassData.studentId,
                        'Outpass Update',
                        'Campus Admin has approved your outpass.'
                      );
                      
                      // Log that we've sent this notification
                      await notifyRef.set({
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        type: 'campus_admin_approval',
                        outpassId: change.doc.id
                      });
                    }
                  }
                  
                  if (outpassData.approvals.os?.status === 'approved' || 
                      outpassData.approvals.ao?.status === 'approved') {
                    
                    // Check if we have already notified for this approval
                    const notifyRef = db.collection('notificationLog')
                      .doc(`${change.doc.id}_os_approval`);
                    
                    const notifyDoc = await notifyRef.get();
                    if (!notifyDoc.exists) {
                      await notificationService.notifyUser(
                        outpassData.studentId,
                        'Outpass Update',
                        'Office Staff has approved your outpass.'
                      );
                      
                      // Log that we've sent this notification
                      await notifyRef.set({
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        type: 'os_approval',
                        outpassId: change.doc.id
                      });
                    }
                  }
                }
              }
            }
          }
        }, error => {
          console.error('Error in status change listener:', error);
        });
        
      console.log('Real-time notification system initialized');
    } catch (error) {
      console.error('Error setting up real-time listeners:', error);
    }
  }
};

// Helper functions
function getFinalStatus(currentStatus) {
  if (currentStatus === 'approved') return 'Approved';
  if (currentStatus === 'rejected') return 'Rejected';
  if (currentStatus.startsWith('pending_')) return 'In Progress';
  return 'Pending';
}

module.exports = outpassService;