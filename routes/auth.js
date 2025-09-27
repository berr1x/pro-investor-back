const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const {
  validateRegistration,
  validateLogin,
  validatePasswordReset,
  validatePasswordChange
} = require('../middleware/validation');

// Регистрация
router.post('/register', validateRegistration, authController.register);

// Вход
router.post('/login', validateLogin, authController.login);

// Восстановление пароля
router.post('/forgot-password', validatePasswordReset, authController.requestPasswordReset);

// Сброс пароля по токену
router.post('/reset-password', authController.resetPassword);

// Смена пароля (требует авторизации)
router.post('/change-password', authenticateToken, validatePasswordChange, authController.changePassword);

// Выход
router.post('/logout', authenticateToken, authController.logout);

// Проверка токена
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    message: 'Token is valid',
    user: req.user
  });
});

// Проверка метода авторизации
router.post('/check-auth-method', authController.getAuthMethod);

module.exports = router;