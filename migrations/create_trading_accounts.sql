-- Создание таблицы торговых счетов
CREATE TABLE IF NOT EXISTS user_trading_accounts (
    id SERIAL PRIMARY KEY,
    userId INTEGER NOT NULL,
    account_number VARCHAR(255) NOT NULL UNIQUE,
    profit DECIMAL(15,2) DEFAULT 0.00,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Создаем индексы
CREATE INDEX IF NOT EXISTS idx_user_trading_accounts_userId ON user_trading_accounts(userId);
CREATE INDEX IF NOT EXISTS idx_user_trading_accounts_account_number ON user_trading_accounts(account_number);

-- Добавляем комментарий к таблице
COMMENT ON TABLE user_trading_accounts IS 'Торговые счета пользователей для инвестиций';