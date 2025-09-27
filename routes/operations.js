const express = require('express');
const router = express.Router();
const operationController = require('../controllers/operationController');
const { authenticateToken } = require('../middleware/auth');
const {
  validateDeposit,
  validateWithdrawal
} = require('../middleware/validation');

// Все маршруты требуют авторизации
router.use(authenticateToken);

// Создание заявки на пополнение
router.post('/deposit', validateDeposit, operationController.createDeposit);

// Создание заявки на вывод средств
router.post('/withdrawal', validateWithdrawal, operationController.createWithdrawal);

// Получение истории операций
router.get('/', operationController.getOperations);

// Получение конкретной операции
router.get('/:operationId', operationController.getOperation);

module.exports = router;