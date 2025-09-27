const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { authenticateToken } = require('../middleware/auth');
const {
  validateProfileUpdate,
  validatePassportData
} = require('../middleware/validation');

// Все маршруты требуют авторизации
router.use(authenticateToken);

// Получение профиля
router.get('/', profileController.getProfile);

// Обновление профиля
router.put('/', validateProfileUpdate, profileController.updateProfile);

// Обновление паспортных данных
router.put('/passport', validatePassportData, profileController.updatePassport);

// Загрузка документа
router.post('/documents', profileController.uploadDocument);

// Получение документов
router.get('/documents', profileController.getDocuments);

// Удаление документа
router.delete('/documents/:documentId', profileController.deleteDocument);

module.exports = router;