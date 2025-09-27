const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { authenticateToken } = require('../middleware/auth');
const { validateAccountCreation } = require('../middleware/validateAccount');

// Все маршруты требуют авторизации
router.use(authenticateToken);

// Получение всех счетов пользователя
router.get('/', accountController.getAccounts);

// Получение статистики по счетам
router.get('/stats', accountController.getAccountStats);

// Создание нового счета с валидацией
router.post('/', validateAccountCreation, accountController.createAccount);

// Получение конкретного счета
router.get('/:accountId', accountController.getAccount);

module.exports = router;