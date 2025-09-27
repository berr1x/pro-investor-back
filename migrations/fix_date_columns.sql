-- Изменяем тип колонок дат с TIMESTAMP на DATE для избежания проблем с часовыми поясами
ALTER TABLE user_passports 
ALTER COLUMN issue_date TYPE DATE USING issue_date::DATE,
ALTER COLUMN birth_date TYPE DATE USING birth_date::DATE;