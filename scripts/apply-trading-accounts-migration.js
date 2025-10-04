const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function applyMigration() {
  try {
    console.log('🚀 Применение миграции для создания таблицы торговых счетов...');

    // Читаем SQL файл миграции
    const migrationPath = path.join(__dirname, '../migrations/create_trading_accounts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Выполняем миграцию
    await pool.query(migrationSQL);

    console.log('✅ Миграция успешно применена!');
    console.log('📊 Таблица user_trading_accounts создана');

    // Проверяем, что таблица создалась
    const result = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_trading_accounts'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Структура таблицы user_trading_accounts:');
    console.table(result.rows);

    // Создаем тестовый торговый счет (если есть пользователи)
    const users = await pool.query('SELECT id FROM users LIMIT 1');
    
    if (users.rows.length > 0) {
      const userId = users.rows[0].id;
      
      // Проверяем, нет ли уже торгового счета у этого пользователя
      const existingAccount = await pool.query(
        'SELECT * FROM user_trading_accounts WHERE userId = $1',
        [userId]
      );

      if (existingAccount.rows.length === 0) {
        const testAccount = await pool.query(`
          INSERT INTO user_trading_accounts (userId, account_number, currency, profit, percentage)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [userId, 'TR' + Date.now(), 'USD', 1250.50, 12.5]);

        console.log('\n🎯 Создан тестовый торговый счет:');
        console.table(testAccount.rows);
      } else {
        console.log('\n📝 У пользователя уже есть торговые счета:');
        console.table(existingAccount.rows);
      }
    } else {
      console.log('\n⚠️  Нет пользователей для создания тестового торгового счета');
    }

  } catch (error) {
    console.error('❌ Ошибка при применении миграции:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запускаем миграцию
applyMigration();