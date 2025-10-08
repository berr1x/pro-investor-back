-- Добавление колонки role в таблицу users
ALTER TABLE users 
ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));

-- Обновляем существующих пользователей (если есть админы, можно указать их ID)
-- UPDATE users SET role = 'admin' WHERE id IN (1, 2); -- раскомментировать и указать ID админов
