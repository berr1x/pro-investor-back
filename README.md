# Pro-Investor Backend

Backend API для инвестиционной платформы PRO-INVESTOR, построенный на Express.js и PostgreSQL.

## 🚀 Функциональность

### ✅ Реализовано
- 🔐 **Система аутентификации** (регистрация, вход, восстановление пароля, смена пароля)
- 👤 **Управление профилем** (персональные данные, паспортные данные, документы)
- 💰 **Управление счетами** (создание счетов, статистика, баланс)
- 💸 **Операции** (пополнение, вывод средств, история операций)
- 📧 **Email уведомления** (автоматические уведомления пользователям и администраторам)
- 👨‍💼 **Админские функции** (управление операциями, пользователями, статистика)
- 🛡️ **Безопасность** (JWT токены, валидация, rate limiting, CORS)
- 📊 **Аналитика** (статистика по операциям, пользователям, счетам)

## Установка и запуск

### Предварительные требования

- Node.js (версия 16 или выше)
- PostgreSQL (версия 12 или выше)
- npm или yarn

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка базы данных

1. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE proinvestor;
```

2. Выполните SQL скрипт для создания таблиц:
```bash
psql -U postgres -d proinvestor -f config/init.sql
```

### 3. Настройка переменных окружения

Скопируйте файл `env.example` в `.env` и настройте переменные:

```bash
cp env.example .env
```

Отредактируйте `.env` файл:

```env
# Database Configuration
DB_USER=postgres
DB_HOST=localhost
DB_NAME=proinvestor
DB_PASSWORD=a223344a
DB_PORT=5432

# JWT Secret (сгенерируйте безопасный ключ)
JWT_SECRET=your-super-secret-jwt-key-here

# Email Configuration (настройте для отправки email)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Server Configuration
PORT=5000
NODE_ENV=development

# Admin Email
ADMIN_EMAIL=admin@pro-investor.com
```

### 4. Запуск сервера

Для разработки:
```bash
npm run dev
```

Для продакшена:
```bash
npm start
```

Сервер будет доступен по адресу: `http://localhost:5000`

## API Endpoints

### Аутентификация

- `POST /api/auth/register` - Регистрация пользователя
- `POST /api/auth/login` - Вход в систему
- `POST /api/auth/forgot-password` - Запрос восстановления пароля
- `POST /api/auth/reset-password` - Сброс пароля по токену
- `POST /api/auth/change-password` - Смена пароля (требует авторизации)
- `POST /api/auth/logout` - Выход из системы
- `GET /api/auth/verify` - Проверка токена

### Примеры запросов

#### Регистрация
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "firstName": "Иван",
    "lastName": "Иванов",
    "middleName": "Иванович"
  }'
```

#### Вход
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

## Структура проекта

```
pro-investor-back/
├── config/           # Конфигурация базы данных
├── controllers/      # Контроллеры API
├── middleware/       # Middleware (auth, validation)
├── models/          # Модели данных
├── routes/          # Маршруты API
├── utils/           # Утилиты (email, helpers)
├── server.js        # Главный файл сервера
└── package.json     # Зависимости проекта
```

## Безопасность

- Пароли хешируются с помощью bcrypt
- JWT токены для аутентификации
- Rate limiting для защиты от DDoS
- Валидация всех входящих данных
- CORS настройки
- Helmet для безопасности заголовков

## Разработка

Для разработки используется nodemon для автоматической перезагрузки сервера при изменениях.

```bash
npm run dev
```

## 🧪 Тестирование

### Автоматическое тестирование API

```bash
# Базовое тестирование аутентификации
node test-api.js

# Полное тестирование всех функций
node test-full-api.js

# Тестирование включая админские функции
node test-complete-api.js
```

### Ручное тестирование

1. **Запустите сервер:**
   ```bash
   npm start
   ```

2. **Проверьте доступность:**
   ```bash
   curl http://localhost:5000/health
   ```

3. **Протестируйте регистрацию:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"TestPass123","firstName":"Тест","lastName":"Пользователь"}'
   ```

### Результаты тестирования

✅ **Все тесты пройдены успешно:**
- Аутентификация и авторизация
- Управление профилем пользователя
- Работа со счетами и операциями
- Админские функции
- Email уведомления
- Валидация данных

## Лицензия

MIT