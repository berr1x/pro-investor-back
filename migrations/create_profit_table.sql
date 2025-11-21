-- Создание таблицы profit
CREATE TABLE IF NOT EXISTS profit (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    account_number VARCHAR(255) NOT NULL,
    from_date VARCHAR(255) NOT NULL,
    to_date VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    percentage NUMERIC(5, 2) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_profit_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

-- Создание индекса для быстрого поиска по userId
CREATE INDEX IF NOT EXISTS idx_profit_userId ON profit("userId");

-- Создание индекса для быстрого поиска по account_number
CREATE INDEX IF NOT EXISTS idx_profit_account_number ON profit(account_number);

-- Комментарии к таблице и колонкам
COMMENT ON TABLE profit IS 'Таблица для хранения доходов пользователей';
COMMENT ON COLUMN profit.id IS 'Уникальный идентификатор дохода';
COMMENT ON COLUMN profit."userId" IS 'Идентификатор пользователя';
COMMENT ON COLUMN profit.account_number IS 'Номер торгового счета';
COMMENT ON COLUMN profit.from_date IS 'Дата начала периода (формат DD.MM.YYYY)';
COMMENT ON COLUMN profit.to_date IS 'Дата окончания периода (формат DD.MM.YYYY)';
COMMENT ON COLUMN profit.amount IS 'Сумма дохода';
COMMENT ON COLUMN profit.percentage IS 'Процент дохода';
COMMENT ON COLUMN profit.created_at IS 'Дата и время создания записи';

