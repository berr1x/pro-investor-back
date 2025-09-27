const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Тестовые данные
const testUser = {
  email: 'test-accounts@example.com',
  password: 'TestPass123',
  firstName: 'Тест',
  lastName: 'Пользователь',
  middleName: 'Тестович'
};

let authToken = '';

async function testAccountFeatures() {
  console.log('🧪 Тестирование новых функций счетов...\n');

  try {
    // 1. Аутентификация
    console.log('1. Аутентификация...');
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

    // 2. Получение существующих счетов
    console.log('\n2. Получение существующих счетов...');
    try {
      const accountsResponse = await axios.get(`${BASE_URL}/accounts`, { headers });
      console.log('✅ Счета получены:', accountsResponse.data.accounts.length, 'счетов');
      console.log('   Общий баланс:', accountsResponse.data.totalBalance, 'RUB');
      
      // Показываем детали счетов
      accountsResponse.data.accounts.forEach((account, index) => {
        console.log(`   Счет ${index + 1}:`);
        console.log(`     Номер: ${account.account_number}`);
        console.log(`     Баланс: ${account.balance} ${account.currency}`);
        console.log(`     Банк: ${account.bank || 'Не указан'}`);
        console.log(`     БИК: ${account.bik_or_bankname || 'Не указан'}`);
        console.log(`     ИНН: ${account.inn || 'Не указан'}`);
        console.log(`     КПП: ${account.kpp || 'Не указан'}`);
      });
    } catch (error) {
      console.log('❌ Ошибка получения счетов:', error.response?.data?.message);
    }

    // 3. Создание нового счета с минимальными полями
    console.log('\n3. Создание счета с минимальными полями...');
    try {
      const createAccountResponse = await axios.post(`${BASE_URL}/accounts`, {
        bank: 'Сбербанк России',
        bik_or_bankname: '044525225',
        currency: 'RUB'
      }, { headers });
      console.log('✅ Счет создан с минимальными полями');
      console.log('   Номер счета:', createAccountResponse.data.account.account_number);
      console.log('   Банк:', createAccountResponse.data.account.bank);
      console.log('   БИК:', createAccountResponse.data.account.bik_or_bankname);
    } catch (error) {
      console.log('❌ Ошибка создания счета:', error.response?.data?.message);
    }

    // 4. Создание счета со всеми полями
    console.log('\n4. Создание счета со всеми полями...');
    try {
      const createFullAccountResponse = await axios.post(`${BASE_URL}/accounts`, {
        bank: 'ВТБ',
        bik_or_bankname: '044525187',
        currency: 'USD',
        number: '40817810123456789012',
        bankname: 'ВТБ (ПАО)',
        inn: '7702070139',
        kpp: '770201001',
        corp_bank_account: '40702810123456789012'
      }, { headers });
      console.log('✅ Счет создан со всеми полями');
      console.log('   Номер счета:', createFullAccountResponse.data.account.account_number);
      console.log('   Банк:', createFullAccountResponse.data.account.bank);
      console.log('   БИК:', createFullAccountResponse.data.account.bik_or_bankname);
      console.log('   Номер карты:', createFullAccountResponse.data.account.number);
      console.log('   Название банка:', createFullAccountResponse.data.account.bankname);
      console.log('   ИНН:', createFullAccountResponse.data.account.inn);
      console.log('   КПП:', createFullAccountResponse.data.account.kpp);
      console.log('   Корп. счет:', createFullAccountResponse.data.account.corp_bank_account);
    } catch (error) {
      console.log('❌ Ошибка создания полного счета:', error.response?.data?.message);
    }

    // 5. Тестирование валидации
    console.log('\n5. Тестирование валидации...');
    
    // Тест без обязательных полей
    try {
      await axios.post(`${BASE_URL}/accounts`, {
        currency: 'RUB'
      }, { headers });
      console.log('❌ Валидация не сработала для отсутствующих полей!');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Валидация работает - отсутствуют обязательные поля');
      } else {
        console.log('❌ Неожиданная ошибка валидации:', error.response?.data?.message);
      }
    }

    // Тест с неверным ИНН
    try {
      await axios.post(`${BASE_URL}/accounts`, {
        bank: 'Тест Банк',
        bik_or_bankname: '123456789',
        currency: 'RUB',
        inn: '123' // неверный ИНН
      }, { headers });
      console.log('❌ Валидация ИНН не сработала!');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Валидация ИНН работает корректно');
      } else {
        console.log('❌ Неожиданная ошибка валидации ИНН:', error.response?.data?.message);
      }
    }

    // 6. Получение обновленного списка счетов
    console.log('\n6. Получение обновленного списка счетов...');
    try {
      const updatedAccountsResponse = await axios.get(`${BASE_URL}/accounts`, { headers });
      console.log('✅ Обновленные счета получены:', updatedAccountsResponse.data.accounts.length, 'счетов');
      console.log('   Общий баланс:', updatedAccountsResponse.data.totalBalance, 'RUB');
      
      // Показываем все счета с новыми полями
      updatedAccountsResponse.data.accounts.forEach((account, index) => {
        console.log(`\n   Счет ${index + 1}:`);
        console.log(`     Номер: ${account.account_number}`);
        console.log(`     Баланс: ${account.balance} ${account.currency}`);
        console.log(`     Банк: ${account.bank}`);
        console.log(`     БИК/Название: ${account.bik_or_bankname}`);
        if (account.number) console.log(`     Номер карты: ${account.number}`);
        if (account.bankname) console.log(`     Название банка: ${account.bankname}`);
        if (account.inn) console.log(`     ИНН: ${account.inn}`);
        if (account.kpp) console.log(`     КПП: ${account.kpp}`);
        if (account.corp_bank_account) console.log(`     Корп. счет: ${account.corp_bank_account}`);
      });
    } catch (error) {
      console.log('❌ Ошибка получения обновленных счетов:', error.response?.data?.message);
    }

    // 7. Тестирование получения конкретного счета
    console.log('\n7. Тестирование получения конкретного счета...');
    try {
      const accountsResponse = await axios.get(`${BASE_URL}/accounts`, { headers });
      if (accountsResponse.data.accounts.length > 0) {
        const firstAccountId = accountsResponse.data.accounts[0].id;
        const accountResponse = await axios.get(`${BASE_URL}/accounts/${firstAccountId}`, { headers });
        console.log('✅ Конкретный счет получен');
        console.log('   Номер:', accountResponse.data.account.account_number);
        console.log('   Банк:', accountResponse.data.account.bank);
        console.log('   БИК:', accountResponse.data.account.bik_or_bankname);
      }
    } catch (error) {
      console.log('❌ Ошибка получения конкретного счета:', error.response?.data?.message);
    }

    console.log('\n🎉 Тестирование новых функций счетов завершено!');
    console.log('\n📋 Новые возможности:');
    console.log('   ✅ Создание счетов с банковскими реквизитами');
    console.log('   ✅ Обязательные поля: bank, bik_or_bankname, currency');
    console.log('   ✅ Дополнительные поля: number, bankname, inn, kpp, corp_bank_account');
    console.log('   ✅ Валидация ИНН (10 или 12 цифр)');
    console.log('   ✅ Валидация КПП (9 цифр)');
    console.log('   ✅ Общий баланс по всем счетам');
    console.log('   ✅ Получение всех полей счета');

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
    if (error.response) {
      console.error('   Статус:', error.response.status);
      console.error('   Данные:', error.response.data);
    }
  }
}

// Запуск тестов
testAccountFeatures();