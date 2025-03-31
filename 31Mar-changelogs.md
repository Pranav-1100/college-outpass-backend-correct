# Outpass Management System Backend Changelog

## Major Changes

### 1. Role Name Updates
- Changed `director` role to `campus_admin`
- Changed `ao` (Academic Officer) role to `os` (Office Staff)
- Updated all routes and services to handle both old and new role names for backward compatibility

### 2. Custom Approval Flows by Leave Type
Implemented different approval flows based on leave category:

- **Academic Leaves:** Warden → Office Staff (OS)
- **Non-Academic Leaves:** Warden → Campus Admin
- **Regular/Long Leaves:** Warden → Campus Admin → Office Staff (OS)

### 3. Student Data Integration
- Added auto-filling of student details for outpass requests
- Implemented automatic linking of student accounts to their records when logging in
- Created endpoints for accessing and updating student data

### 4. Role Compatibility System
- Enhanced authentication middleware to map between old and new role names
- Added support for both role naming conventions in database queries
- Implemented automatic role detection and mapping in approvals

## Technical Changes

### Authentication & Authorization
#### `auth.middleware.js`
- Added role mapping dictionaries for old→new role conversion
- Updated `verifyAuth` to detect and map old role names
- Enhanced `hasRole` middleware to check for both old and new role names
- Added helper functions for database queries

#### `auth.service.js`
- Updated to detect student email addresses and link to student records
- Added support for automatic profile population from student data
- Maintained compatibility with custom claims storage

### Outpass Processing
#### `outpass.service.js`
- Added constants for leave types and approval flows
- Updated `createRequest` to set the appropriate approval flow based on leave category
- Modified `processApproval` for compatibility with both role naming conventions
- Enhanced `getPendingApprovals` and `getApprovalHistory` for role compatibility
- Updated status checks to handle both sequential and parallel approval flows

#### `outpass.routes.js`
- Reordered routes to prevent path conflicts
- Updated status route to check for approvals under both old and new field names
- Enhanced error handling and logging

### Student Data Management
#### `student.routes.js`
Added endpoints for student data retrieval and management:
- `GET /api/student/my-data` - Get current user's student data
- `GET /api/student/prn/:prn` - Get student data by PRN
- `POST /api/student/link` - Link user account to student record
- `GET /api/student/email/:email` - Get student by email

### Student Data Import
- Created import script for one-time CSV data loading
- Added functionality to create email-to-PRN index for quick lookups
- Implemented auto-linking of student accounts based on institutional email

## Database Schema Updates

### Outpass Document
Added new fields:
- `leaveCategory`: `'academic'`, `'non_academic'`, or `'regular'`
- `approvalFlow`: Array of role names required for this leave
- `branch`: Student's academic branch

Enhanced approval structure to handle role name variants

### User Document
Added fields for student data linking:
- `studentPRN`: Student's PRN for linking to student record
- `studentData`: Cached copy of student details

### New Collections
- `students`: Stores all student records imported from CSV
- `emailToPRN`: Index mapping student emails to PRNs
- `notificationLog`: Tracks notifications sent to avoid duplicates

## Approval Flow Changes

### Previous Flow (Sequential)
1. Student creates outpass request
2. Warden approves
3. Director/Campus Admin approves
4. AO/OS approves
5. Outpass marked as approved

### New Flow (Parallel with Custom Paths)
1. Student creates outpass request and selects leave category
2. System determines required approvers based on category
3. All required approvers receive notification simultaneously
4. Each approver can approve/reject independently
5. Once all required approvers approve, outpass is marked as approved
6. If any approver rejects, outpass is immediately rejected

## API Changes

### New Request Parameters
- `leaveCategory`: Required in outpass creation to determine approval flow

### New Response Fields
- `approvalFlow`: Array of roles required for approval
- `statusHistory`: Updated to include both old and new role names

## Frontend Integration Notes
- **Role Display:** Always use new role names in UI (Campus Admin, Office Staff)
- **Form Updates:** Add dropdown for leave category selection
- **Status Visualization:** Show approval flow based on leave category
- **Auto-fill:** Implement retrieval of student data when creating outpass requests

## Compatibility Notes
- System maintains backward compatibility with existing outpasses
- Existing tokens with old role names will continue to work
- No database migration required for existing data
- No user re-authentication required
