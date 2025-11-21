const express = require('express');
const router = express.Router();
const profitController = require('../controllers/profitController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Все маршруты требуют авторизации и админских прав
router.use(authenticateToken);
router.use(requireAdmin);

// Получение всех доходов
router.get('/', profitController.getAllProfits);

// Создание дохода
router.post('/', profitController.createProfit);

// Удаление дохода
router.delete('/:profitId', profitController.deleteProfit);

module.exports = router;

