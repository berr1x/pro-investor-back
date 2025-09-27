const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Все маршруты требуют авторизации и админских прав
router.use(authenticateToken);
router.use(requireAdmin);

// Получение всех операций
router.get('/operations', adminController.getAllOperations);

// Обновление статуса операции
router.put('/operations/:operationId/status', adminController.updateOperationStatus);

// Получение статистики
router.get('/stats', adminController.getAdminStats);

// Получение всех пользователей
router.get('/users', adminController.getAllUsers);

// Блокировка/разблокировка пользователя
router.put('/users/:userId/status', adminController.toggleUserStatus);

module.exports = router;