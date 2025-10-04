const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    createTradingAccount,
    getTradingAccounts,
    getTradingAccount,
    updateTradingAccountProfit,
    closeTradingAccount
} = require('../controllers/tradingAccountController');

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Создание торгового счета
router.post('/', createTradingAccount);

// Получение всех торговых счетов пользователя
router.get('/', getTradingAccounts);

// Получение конкретного торгового счета
router.get('/:id', getTradingAccount);

// Обновление прибыли торгового счета (только админы)
router.put('/:id/profit', updateTradingAccountProfit);

// Закрытие торгового счета
router.put('/:id/close', closeTradingAccount);

module.exports = router;