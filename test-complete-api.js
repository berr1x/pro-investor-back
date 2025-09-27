const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Тестовые данные
const testUser = {
  email: 'test@example.com',
  password: 'TestPass123',
  firstName: 'Тест',
  lastName: 'Пользователь',
  middleName: 'Тестович'
};

let authToken = '';

async function testCompleteAPI() {
  console.log('🚀 Полное тестирование API Pro-Investor (включая админские функции)...\n');

  try {
    // 1. Аутентификация
    console.log('1. Тестирование аутентификации...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      console.log('✅ Вход успешен');
      authToken = loginResponse.data.token;
    } catch (error) {
      if (error.response?.status === 401) {
        const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
        console.log('✅ Регистрация успешна');
        authToken = registerResponse.data.token;
      } else {
        throw error;
      }
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // 2. Создание заявки на пополнение
    console.log('\n2. Создание заявки на пополнение...');
    let operationId;
    try {
      const depositResponse = await axios.post(`${BASE_URL}/operations/deposit`, {
        amount: 100000,
        comment: 'Тестовое пополнение для админских тестов',
        contactMethod: 'email'
      }, { headers });
      operationId = depositResponse.data.operation.id;
      console.log('✅ Заявка на пополнение создана:', operationId);
    } catch (error) {
      console.log('❌ Ошибка создания заявки:', error.response?.data?.message);
    }

    // 3. Тестирование админских функций (используем тот же токен для простоты)
    console.log('\n3. Тестирование админских функций...');
    
    // Получение всех операций
    try {
      const allOpsResponse = await axios.get(`${BASE_URL}/admin/operations`, { headers });
      console.log('✅ Все операции получены:', allOpsResponse.data.operations.length, 'операций');
    } catch (error) {
      console.log('❌ Ошибка получения операций:', error.response?.data?.message);
    }

    // Получение статистики
    try {
      const statsResponse = await axios.get(`${BASE_URL}/admin/stats`, { headers });
      console.log('✅ Статистика получена:');
      console.log(`   Всего операций: ${statsResponse.data.operations.total_operations}`);
      console.log(`   Ожидающих: ${statsResponse.data.operations.pending_operations}`);
      console.log(`   Завершенных: ${statsResponse.data.operations.completed_operations}`);
      console.log(`   Всего пользователей: ${statsResponse.data.users.total_users}`);
    } catch (error) {
      console.log('❌ Ошибка получения статистики:', error.response?.data?.message);
    }

    // Получение всех пользователей
    try {
      const usersResponse = await axios.get(`${BASE_URL}/admin/users`, { headers });
      console.log('✅ Пользователи получены:', usersResponse.data.users.length, 'пользователей');
    } catch (error) {
      console.log('❌ Ошибка получения пользователей:', error.response?.data?.message);
    }

    // Обновление статуса операции (если есть операция)
    if (operationId) {
      console.log('\n4. Обновление статуса операции...');
      try {
        const statusResponse = await axios.put(`${BASE_URL}/admin/operations/${operationId}/status`, {
          status: 'processing',
          adminComment: 'Обрабатывается администратором'
        }, { headers });
        console.log('✅ Статус операции обновлен на "processing"');
      } catch (error) {
        console.log('❌ Ошибка обновления статуса:', error.response?.data?.message);
      }

      // Завершение операции
      try {
        const completeResponse = await axios.put(`${BASE_URL}/admin/operations/${operationId}/status`, {
          status: 'completed',
          adminComment: 'Операция успешно завершена'
        }, { headers });
        console.log('✅ Операция завершена');
      } catch (error) {
        console.log('❌ Ошибка завершения операции:', error.response?.data?.message);
      }
    }

    // 5. Проверка обновленного баланса
    console.log('\n5. Проверка обновленного баланса...');
    try {
      const accountsResponse = await axios.get(`${BASE_URL}/accounts/stats`, { headers });
      console.log('✅ Обновленная статистика:');
      console.log(`   Общий баланс: ${accountsResponse.data.totalBalance} RUB`);
      console.log(`   Количество операций: ${accountsResponse.data.operations.total}`);
    } catch (error) {
      console.log('❌ Ошибка получения статистики счетов:', error.response?.data?.message);
    }

    console.log('\n🎉 Полное тестирование API завершено!');
    console.log('\n📋 Все доступные API endpoints:');
    console.log('\n🔐 Аутентификация:');
    console.log('   POST /api/auth/register - Регистрация');
    console.log('   POST /api/auth/login - Вход');
    console.log('   GET /api/auth/verify - Проверка токена');
    console.log('   POST /api/auth/logout - Выход');
    
    console.log('\n👤 Профиль пользователя:');
    console.log('   GET /api/profile - Получение профиля');
    console.log('   PUT /api/profile - Обновление профиля');
    console.log('   PUT /api/profile/passport - Паспортные данные');
    console.log('   POST /api/profile/documents - Загрузка документа');
    console.log('   GET /api/profile/documents - Получение документов');
    console.log('   DELETE /api/profile/documents/:id - Удаление документа');
    
    console.log('\n💰 Счета:');
    console.log('   GET /api/accounts - Счета пользователя');
    console.log('   GET /api/accounts/stats - Статистика счетов');
    console.log('   POST /api/accounts - Создание счета');
    console.log('   GET /api/accounts/:id - Конкретный счет');
    
    console.log('\n💸 Операции:');
    console.log('   POST /api/operations/deposit - Заявка на пополнение');
    console.log('   POST /api/operations/withdrawal - Заявка на вывод');
    console.log('   GET /api/operations - История операций');
    console.log('   GET /api/operations/:id - Конкретная операция');
    
    console.log('\n👨‍💼 Админские функции:');
    console.log('   GET /api/admin/operations - Все операции');
    console.log('   PUT /api/admin/operations/:id/status - Обновление статуса');
    console.log('   GET /api/admin/stats - Админская статистика');
    console.log('   GET /api/admin/users - Все пользователи');
    console.log('   PUT /api/admin/users/:id/status - Блокировка пользователя');

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
    if (error.response) {
      console.error('   Статус:', error.response.status);
      console.error('   Данные:', error.response.data);
    }
  }
}

// Запуск тестов
testCompleteAPI();