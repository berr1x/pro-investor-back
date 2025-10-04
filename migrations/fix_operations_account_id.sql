-- Исправление внешнего ключа account_id в таблице operations
-- Убираем внешний ключ, так как account_id может ссылаться на разные таблицы

-- Удаляем существующий внешний ключ
ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_account_id_fkey;

-- Добавляем комментарий к полю для ясности
COMMENT ON COLUMN operations.account_id IS 'ID счета: может быть ID из user_accounts (банковские счета) или user_trading_accounts (торговые счета)';
