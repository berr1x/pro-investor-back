const { body, validationResult } = require('express-validator');

// Middleware для обработки ошибок валидации
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Валидация регистрации
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('First name must be between 2 and 100 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Last name must be between 2 and 100 characters'),
  body('middleName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Middle name must not exceed 100 characters'),
  handleValidationErrors
];

// Валидация входа
const validateLogin = [
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Валидация восстановления пароля
const validatePasswordReset = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  handleValidationErrors
];

// Валидация смены пароля
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  handleValidationErrors
];

// Валидация обновления профиля
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('First name must be between 2 and 100 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Last name must be between 2 and 100 characters'),
  body('middleName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Middle name must not exceed 100 characters'),
  body('phone')
    .optional()
    .isMobilePhone('ru-RU')
    .withMessage('Valid Russian phone number is required'),
  handleValidationErrors
];

// Валидация паспортных данных
const validatePassportData = [
  body('series')
    .optional()
    .isLength({ min: 4, max: 4 })
    .withMessage('Passport series must be 4 digits'),
  body('number')
    .optional()
    .isLength({ min: 6, max: 6 })
    .withMessage('Passport number must be 6 digits'),
  body('issuedBy')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Issued by must not exceed 255 characters'),
  body('issueDate')
    .optional()
    .isISO8601()
    .withMessage('Valid issue date is required'),
  body('departmentCode')
    .optional()
    .isLength({ min: 6, max: 6 })
    .withMessage('Department code must be 6 digits'),
  body('gender')
    .optional()
    .isIn(['male', 'female'])
    .withMessage('Gender must be male or female'),
  body('birthDate')
    .optional()
    .isISO8601()
    .withMessage('Valid birth date is required'),
  handleValidationErrors
];

// Валидация операций
const validateDeposit = [
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters'),
  handleValidationErrors
];

const validateWithdrawal = [
  body('recipientDetails')
    .isObject()
    .withMessage('Recipient details are required'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateRegistration,
  validateLogin,
  validatePasswordReset,
  validatePasswordChange,
  validateProfileUpdate,
  validatePassportData,
  validateDeposit,
  validateWithdrawal
};