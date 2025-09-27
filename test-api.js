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

async function testAPI() {
  console.log('🧪 Тестирование API Pro-Investor...\n');

  try {
    // Тест 1: Регистрация пользователя
    console.log('1. Тестирование регистрации...');
    try {
      const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
      console.log('✅ Регистрация успешна:', registerResponse.data.message);
      console.log('   Пользователь:', registerResponse.data.user);
      console.log('   Токен получен:', !!registerResponse.data.token);
    } catch (error) {
      if (error.response?.status === 400 && error.response.data.message.includes('already exists')) {
        console.log('⚠️  Пользователь уже существует, продолжаем тестирование...');
      } else {
        console.log('❌ Ошибка регистрации:', error.response?.data || error.message);
      }
    }

    // Тест 2: Вход в систему
    console.log('\n2. Тестирование входа...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      console.log('✅ Вход успешен:', loginResponse.data.message);
      console.log('   Пользователь:', loginResponse.data.user);
      console.log('   Токен получен:', !!loginResponse.data.token);
      
      const token = loginResponse.data.token;
      
      // Тест 3: Проверка токена
      console.log('\n3. Тестирование проверки токена...');
      try {
        const verifyResponse = await axios.get(`${BASE_URL}/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Токен валиден:', verifyResponse.data.message);
        console.log('   Пользователь:', verifyResponse.data.user);
      } catch (error) {
        console.log('❌ Ошибка проверки токена:', error.response?.data || error.message);
      }

      // Тест 4: Выход из системы
      console.log('\n4. Тестирование выхода...');
      try {
        const logoutResponse = await axios.post(`${BASE_URL}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Выход успешен:', logoutResponse.data.message);
      } catch (error) {
        console.log('❌ Ошибка выхода:', error.response?.data || error.message);
      }

    } catch (error) {
      console.log('❌ Ошибка входа:', error.response?.data || error.message);
    }

    // Тест 5: Тестирование валидации
    console.log('\n5. Тестирование валидации...');
    try {
      const invalidRegisterResponse = await axios.post(`${BASE_URL}/auth/register`, {
        email: 'invalid-email',
        password: '123', // слишком короткий пароль
        firstName: 'A', // слишком короткое имя
        lastName: 'B' // слишком короткая фамилия
      });
      console.log('❌ Валидация не сработала - это ошибка!');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Валидация работает корректно');
        console.log('   Ошибки валидации:', error.response.data.errors?.length || 0);
      } else {
        console.log('❌ Неожиданная ошибка валидации:', error.response?.data || error.message);
      }
    }

    console.log('\n🎉 Тестирование завершено!');

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

// Запуск тестов
testAPI();