const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getAllTradingAccounts,
  createTradingAccount,
  updateTradingAccount,
  toggleTradingAccountStatus
} = require('../controllers/adminTradingAccountController');

// Применяем middleware аутентификации ко всем маршрутам
router.use(authenticateToken);

// Получение всех торговых счетов
router.get('/', getAllTradingAccounts);

// Создание торгового счета
router.post('/', createTradingAccount);

// Обновление торгового счета
router.put('/:accountId', updateTradingAccount);

// Переключение статуса торгового счета
router.put('/:accountId/status', toggleTradingAccountStatus);

module.exports = router;
