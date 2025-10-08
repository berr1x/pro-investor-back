-- Добавление поля deposit_amount в таблицу user_trading_accounts
ALTER TABLE user_trading_accounts 
ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(15,2) DEFAULT 0.00;

-- Обновляем существующие записи, устанавливая deposit_amount = 0
UPDATE user_trading_accounts 
SET deposit_amount = 0.00 
WHERE deposit_amount IS NULL;

-- Делаем поле NOT NULL
ALTER TABLE user_trading_accounts 
ALTER COLUMN deposit_amount SET NOT NULL;

-- Добавляем комментарий
COMMENT ON COLUMN user_trading_accounts.deposit_amount IS 'Сумма депозита торгового счета';
