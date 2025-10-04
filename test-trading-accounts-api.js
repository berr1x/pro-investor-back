const axios = require('axios');

const API_URL = 'http://localhost:5000';

// Тестовые данные пользователя
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  firstName: 'Тест',
  lastName: 'Пользователь'
};

let authToken = '';

async function testTradingAccountsAPI() {
  try {
    console.log('🚀 Тестирование API торговых счетов...\n');

    // 1. Регистрация или вход пользователя
    console.log('1️⃣ Попытка входа в систему...');
    try {
      const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      
      authToken = loginResponse.data.token;
      console.log('✅ Вход выполнен успешно');
    } catch (error) {
      console.log('📝 Пользователь не найден, регистрируем нового...');
      
      const registerResponse = await axios.post(`${API_URL}/api/auth/register`, testUser);
      authToken = registerResponse.data.token;
      console.log('✅ Регистрация выполнена успешно');
    }

    const headers = {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Получение списка торговых счетов (должен быть пустым)
    console.log('\n2️⃣ Получение списка торговых счетов...');
    const accountsResponse = await axios.get(`${API_URL}/api/trading-accounts`, { headers });
    console.log('✅ Торговые счета получены:', accountsResponse.data);

    // 3. Создание торгового счета в USD
    console.log('\n3️⃣ Создание торгового счета в USD...');
    const createUSDResponse = await axios.post(`${API_URL}/api/trading-accounts`, {
      currency: 'USD'
    }, { headers });
    console.log('✅ Торговый счет USD создан:', createUSDResponse.data);

    const usdAccountId = createUSDResponse.data.account.id;

    // 4. Создание торгового счета в EUR
    console.log('\n4️⃣ Создание торгового счета в EUR...');
    const createEURResponse = await axios.post(`${API_URL}/api/trading-accounts`, {
      currency: 'EUR'
    }, { headers });
    console.log('✅ Торговый счет EUR создан:', createEURResponse.data);

    // 5. Попытка создать еще один счет в USD (должна вернуть ошибку)
    console.log('\n5️⃣ Попытка создать дублирующий счет в USD...');
    try {
      await axios.post(`${API_URL}/api/trading-accounts`, {
        currency: 'USD'
      }, { headers });
      console.log('❌ Ошибка: дублирующий счет не должен создаваться');
    } catch (error) {
      console.log('✅ Правильно: дублирующий счет отклонен:', error.response.data.message);
    }

    // 6. Получение конкретного торгового счета
    console.log('\n6️⃣ Получение конкретного торгового счета...');
    const accountResponse = await axios.get(`${API_URL}/api/trading-accounts/${usdAccountId}`, { headers });
    console.log('✅ Торговый счет получен:', accountResponse.data);

    // 7. Получение обновленного списка торговых счетов
    console.log('\n7️⃣ Получение обновленного списка торговых счетов...');
    const updatedAccountsResponse = await axios.get(`${API_URL}/api/trading-accounts`, { headers });
    console.log('✅ Обновленный список торговых счетов:', updatedAccountsResponse.data);

    // 8. Тестирование банковских счетов (должны быть отдельными)
    console.log('\n8️⃣ Получение банковских счетов...');
    const bankAccountsResponse = await axios.get(`${API_URL}/api/accounts`, { headers });
    console.log('✅ Банковские счета получены:', bankAccountsResponse.data);

    // 9. Создание банковского счета
    console.log('\n9️⃣ Создание банковского счета...');
    const createBankAccountResponse = await axios.post(`${API_URL}/api/accounts`, {
      bank: 'Тестовый Банк',
      bik_or_bankname: '044525225',
      currency: 'RUB'
    }, { headers });
    console.log('✅ Банковский счет создан:', createBankAccountResponse.data);

    // 10. Проверка статистики счетов
    console.log('\n🔟 Получение статистики счетов...');
    const statsResponse = await axios.get(`${API_URL}/api/accounts/stats`, { headers });
    console.log('✅ Статистика счетов:', statsResponse.data);

    console.log('\n🎉 Все тесты API торговых счетов прошли успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании API:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Запускаем тесты
testTradingAccountsAPI();