const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminTradingAccountController = require('../controllers/adminTradingAccountController');
const operationController = require('../controllers/operationController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Все маршруты требуют авторизации и админских прав
router.use(authenticateToken);
router.use(requireAdmin);

// Получение всех операций
router.get('/operations', adminController.getAllOperations);

// Обновление статуса операции
router.put('/operations/:operationId/status', adminController.updateOperationStatus);

// Начисление средств по операции пополнения
router.post('/operations/:operationId/process-deposit', adminController.processDeposit);

// Получение статистики
router.get('/stats', adminController.getAdminStats);

// Получение всех пользователей
router.get('/users', adminController.getAllUsers);

// Блокировка/разблокировка пользователя
router.put('/users/:userId/status', adminController.toggleUserStatus);

// Получение детальной информации о пользователе
router.get('/users/:userId/details', adminController.getUserDetails);

// Получение пользователя по ID (алиас для getUserDetails)
router.get('/users/:userId', adminController.getUserDetails);

// Получение всех счетов
router.get('/accounts', adminController.getAllAccounts);

// Блокировка/разблокировка счета
router.put('/accounts/:accountId/status', adminController.toggleAccountStatus);

// Обновление баланса счета
router.put('/accounts/:accountId/balance', adminController.updateAccountBalance);

// Обновление процента счета
router.put('/accounts/:accountId/percentage', adminController.updateAccountPercentage);

// Редактирование пользователя
router.put('/users/:userId', adminController.updateUser);

// Редактирование банковского счета
router.put('/accounts/:accountId', adminController.updateBankAccount);

// Редактирование торгового счета
router.put('/trading-accounts/:accountId', adminTradingAccountController.updateTradingAccount);

// Редактирование паспортных данных пользователя
router.put('/users/:userId/passport', adminController.updateUserPassport);

// Редактирование операции
router.put('/operations/:operationId', adminController.updateOperation);

// Обновление роли пользователя
router.put('/users/:userId/role', adminController.updateUserRole);

// Получение счетов пользователя для создания операции
router.get('/users/:userId/accounts', adminController.getUserAccounts);

// Создание операции от имени пользователя
router.post('/operations/create', operationController.createUserOperation);

// Удаление операции
router.delete('/operations/:operationId', adminController.deleteOperation);

module.exports = router;