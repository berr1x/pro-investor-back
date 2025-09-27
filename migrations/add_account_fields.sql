-- Migration: Add new fields to user_accounts table
-- Date: 2024-01-01

-- Add new required fields
ALTER TABLE user_accounts 
ADD COLUMN IF NOT EXISTS bank VARCHAR(255),
ADD COLUMN IF NOT EXISTS bik_or_bankname VARCHAR(255),
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'RUB';

-- Add new optional fields
ALTER TABLE user_accounts 
ADD COLUMN IF NOT EXISTS number VARCHAR(255),
ADD COLUMN IF NOT EXISTS bankname VARCHAR(255),
ADD COLUMN IF NOT EXISTS inn VARCHAR(20),
ADD COLUMN IF NOT EXISTS kpp VARCHAR(20),
ADD COLUMN IF NOT EXISTS corp_bank_account VARCHAR(255);

-- Update existing records to have default values for required fields
UPDATE user_accounts 
SET bank = 'Default Bank', 
    bik_or_bankname = 'Default BIK'
WHERE bank IS NULL OR bik_or_bankname IS NULL;

-- Make required fields NOT NULL
ALTER TABLE user_accounts 
ALTER COLUMN bank SET NOT NULL,
ALTER COLUMN bik_or_bankname SET NOT NULL;