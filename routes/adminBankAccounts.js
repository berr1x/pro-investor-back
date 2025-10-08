const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getAllBankAccounts,
  toggleBankAccountStatus
} = require('../controllers/adminBankAccountController');

// Применяем middleware аутентификации ко всем маршрутам
router.use(authenticateToken);

// Получение всех банковских счетов
router.get('/', getAllBankAccounts);

// Переключение статуса банковского счета
router.put('/:accountId/status', toggleBankAccountStatus);

module.exports = router;
