const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getAllBankAccounts,
  toggleBankAccountStatus,
  deleteBankAccount
} = require('../controllers/adminBankAccountController');

// Применяем middleware аутентификации ко всем маршрутам
router.use(authenticateToken);

// Получение всех банковских счетов
router.get('/', getAllBankAccounts);

// Переключение статуса банковского счета
router.put('/:accountId/status', toggleBankAccountStatus);

// Удаление банковского счета
router.delete('/:accountId', deleteBankAccount);

module.exports = router;
