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

async function testFullAPI() {
  console.log('🧪 Полное тестирование API Pro-Investor...\n');

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
        // Пользователь не существует, создаем его
        const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
        console.log('✅ Регистрация успешна');
        authToken = registerResponse.data.token;
      } else {
        throw error;
      }
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // 2. Тестирование профиля
    console.log('\n2. Тестирование профиля...');
    try {
      const profileResponse = await axios.get(`${BASE_URL}/profile`, { headers });
      console.log('✅ Получение профиля:', profileResponse.data.user.firstName);
    } catch (error) {
      console.log('❌ Ошибка получения профиля:', error.response?.data?.message);
    }

    // 3. Обновление профиля
    console.log('\n3. Тестирование обновления профиля...');
    try {
      const updateResponse = await axios.put(`${BASE_URL}/profile`, {
        phone: '+7 (999) 123-45-67'
      }, { headers });
      console.log('✅ Профиль обновлен:', updateResponse.data.message);
    } catch (error) {
      console.log('❌ Ошибка обновления профиля:', error.response?.data?.message);
    }

    // 4. Обновление паспортных данных
    console.log('\n4. Тестирование паспортных данных...');
    try {
      const passportResponse = await axios.put(`${BASE_URL}/profile/passport`, {
        series: '1234',
        number: '567890',
        issuedBy: 'ОУФМС России по г. Москве',
        issueDate: '2020-01-15',
        departmentCode: '123456',
        gender: 'male',
        birthDate: '1990-05-20'
      }, { headers });
      console.log('✅ Паспортные данные обновлены');
    } catch (error) {
      console.log('❌ Ошибка обновления паспортных данных:', error.response?.data?.message);
    }

    // 5. Тестирование счетов
    console.log('\n5. Тестирование счетов...');
    try {
      const accountsResponse = await axios.get(`${BASE_URL}/accounts`, { headers });
      console.log('✅ Счета получены:', accountsResponse.data.accounts.length, 'счетов');
    } catch (error) {
      console.log('❌ Ошибка получения счетов:', error.response?.data?.message);
    }

    // 6. Статистика счетов
    console.log('\n6. Тестирование статистики счетов...');
    try {
      const statsResponse = await axios.get(`${BASE_URL}/accounts/stats`, { headers });
      console.log('✅ Статистика получена:');
      console.log(`   Общий баланс: ${statsResponse.data.totalBalance} RUB`);
      console.log(`   Количество счетов: ${statsResponse.data.accountsCount}`);
      console.log(`   Доходность: ${statsResponse.data.profitability.annual}% годовых`);
    } catch (error) {
      console.log('❌ Ошибка получения статистики:', error.response?.data?.message);
    }

    // 7. Создание заявки на пополнение
    console.log('\n7. Тестирование заявки на пополнение...');
    try {
      const depositResponse = await axios.post(`${BASE_URL}/operations/deposit`, {
        amount: 50000,
        comment: 'Тестовое пополнение',
        contactMethod: 'email'
      }, { headers });
      console.log('✅ Заявка на пополнение создана:', depositResponse.data.operation.id);
    } catch (error) {
      console.log('❌ Ошибка создания заявки на пополнение:', error.response?.data?.message);
    }

    // 8. Создание заявки на вывод
    console.log('\n8. Тестирование заявки на вывод...');
    try {
      const withdrawalResponse = await axios.post(`${BASE_URL}/operations/withdrawal`, {
        amount: 10000,
        recipientDetails: {
          bankName: 'Сбербанк',
          accountNumber: '40817810123456789012',
          bik: '044525225'
        },
        comment: 'Тестовый вывод средств'
      }, { headers });
      console.log('✅ Заявка на вывод создана:', withdrawalResponse.data.operation.id);
    } catch (error) {
      console.log('❌ Ошибка создания заявки на вывод:', error.response?.data?.message);
    }

    // 9. Получение истории операций
    console.log('\n9. Тестирование истории операций...');
    try {
      const operationsResponse = await axios.get(`${BASE_URL}/operations`, { headers });
      console.log('✅ История операций получена:', operationsResponse.data.operations.length, 'операций');
      console.log(`   Всего страниц: ${operationsResponse.data.pagination.pages}`);
    } catch (error) {
      console.log('❌ Ошибка получения истории операций:', error.response?.data?.message);
    }

    // 10. Тестирование валидации
    console.log('\n10. Тестирование валидации...');
    try {
      const invalidDepositResponse = await axios.post(`${BASE_URL}/operations/deposit`, {
        amount: 100, // слишком маленькая сумма
        comment: 'Тест валидации'
      }, { headers });
      console.log('❌ Валидация не сработала!');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Валидация работает корректно');
      } else {
        console.log('❌ Неожиданная ошибка валидации:', error.response?.data?.message);
      }
    }

    console.log('\n🎉 Полное тестирование API завершено!');
    console.log('\n📋 Доступные API endpoints:');
    console.log('   POST /api/auth/register - Регистрация');
    console.log('   POST /api/auth/login - Вход');
    console.log('   GET /api/auth/verify - Проверка токена');
    console.log('   GET /api/profile - Получение профиля');
    console.log('   PUT /api/profile - Обновление профиля');
    console.log('   PUT /api/profile/passport - Паспортные данные');
    console.log('   GET /api/accounts - Счета пользователя');
    console.log('   GET /api/accounts/stats - Статистика счетов');
    console.log('   POST /api/operations/deposit - Заявка на пополнение');
    console.log('   POST /api/operations/withdrawal - Заявка на вывод');
    console.log('   GET /api/operations - История операций');

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
    if (error.response) {
      console.error('   Статус:', error.response.status);
      console.error('   Данные:', error.response.data);
    }
  }
}

// Запуск тестов
testFullAPI();