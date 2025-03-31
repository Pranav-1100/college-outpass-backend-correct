const { body, param, validationResult } = require('express-validator');
const { sendError } = require('../utils/response.util');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return sendError(res, 400, {
      message: 'Validation error',
      errors: errors.array()
    });
  };
};

// Validation rules for outpass request - with student data fields and leave category
const outpassValidation = [
  body('purpose')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Purpose must be between 5 and 200 characters'),
  body('fromDate')
    .isISO8601()
    .withMessage('Invalid from date format'),
  body('toDate')
    .isISO8601()
    .withMessage('Invalid to date format')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.fromDate)) {
        throw new Error('To date must be after from date');
      }
      return true;
    }),
  body('destination')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Destination must be between 3 and 100 characters'),
  body('prn')
    .notEmpty()
    .withMessage('PRN is required'),
  
  // New leave category field
  body('leaveCategory')
    .optional()
    .isIn(['academic', 'non_academic', 'regular'])
    .withMessage('Leave category must be academic, non_academic, or regular'),
  
  // These fields are now optional as they can be auto-filled
  body('fatherName')
    .optional()
    .notEmpty()
    .withMessage('Father\'s name is required'),
  body('fatherEmail')
    .optional()
    .isEmail()
    .withMessage('Valid father\'s email is required'),
  body('fatherPhone')
    .optional()
    .notEmpty()
    .withMessage('Father\'s phone is required'),
  body('motherName')
    .optional()
    .notEmpty()
    .withMessage('Mother\'s name is required'),
  body('motherEmail')
    .optional()
    .isEmail()
    .withMessage('Valid mother\'s email is required'),
  body('motherPhone')
    .optional()
    .notEmpty()
    .withMessage('Mother\'s phone is required'),
  body('studentEmail')
    .optional()
    .isEmail()
    .withMessage('Valid student email is required'),
  body('studentPhone')
    .optional()
    .notEmpty()
    .withMessage('Student phone is required'),
  
  body('outTime')
    .notEmpty()
    .withMessage('Out time is required'),
  body('inTime')
    .notEmpty()
    .withMessage('In time is required')
];

// Validation rules for approval/rejection
const approvalValidation = [
  body('decision')
    .isIn(['approved', 'rejected'])
    .withMessage('Decision must be either approved or rejected'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comments must not exceed 500 characters')
];

// Validation rules for user creation - updated for new roles
const userValidation = [
  body('email')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('role')
    .isIn(['student', 'warden', 'campus_admin', 'os', 'staff', 'admin'])
    .withMessage('Invalid role'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Department must not exceed 50 characters')
];

module.exports = {
  validate,
  outpassValidation,
  approvalValidation,
  userValidation
};
