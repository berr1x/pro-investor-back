const axios = require('axios');

// Конфигурация
const API_URL = 'http://localhost:5000/api';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUsImlhdCI6MTc1ODkwMDM4MCwiZXhwIjoxNzU4OTg2NzgwfQ.aG6_6HYCJbjyCTn3ng-Egt2mXd22L1H5wywySflG6is';

// Данные для создания счета
const accountData = {
  bank: 'Сбербанк России',
  bik_or_bankname: '044525225',
  currency: 'RUB'
};

async function createAccount() {
  try {
    console.log('Создаем банковский счет...');
    console.log('Данные:', accountData);
    
    const response = await axios.post(`${API_URL}/accounts`, accountData, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Счет успешно создан!');
    console.log('Ответ сервера:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Ошибка при создании счета:');
    
    if (error.response) {
      // Ошибка от сервера
      console.error('Статус:', error.response.status);
      console.error('Данные ошибки:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // Ошибка сети
      console.error('Ошибка сети:', error.message);
      console.error('Проверьте, что сервер запущен на http://localhost:5000');
    } else {
      // Другая ошибка
      console.error('Ошибка:', error.message);
    }
  }
}

// Запускаем скрипт
createAccount();