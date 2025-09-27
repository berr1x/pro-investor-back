# Pro-Investor API Documentation

## Обзор

API для инвестиционной платформы PRO-INVESTOR, построенный на Express.js и PostgreSQL. Предоставляет полный функционал для управления пользователями, счетами, операциями и административными задачами.

## 🆕 Последние обновления

### Расширенное управление счетами
- **Новые поля для банковских реквизитов**: добавлена поддержка полной банковской информации при создании счетов
- **Обязательные поля**: `bank`, `bik_or_bankname`, `currency`
- **Дополнительные поля**: `number`, `bankname`, `inn`, `kpp`, `corp_bank_account`
- **Общая сумма средств**: в ответе GET `/api/accounts` добавлено поле `totalBalance`
- **Валидация**: строгая валидация ИНН (10/12 цифр) и КПП (9 цифр)
- **Гибкость**: возможность создания счетов как с минимальными, так и с полными данными

## Базовый URL

```
http://localhost:5000/api
```

## Аутентификация

Все защищенные маршруты требуют JWT токен в заголовке:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 🔐 Аутентификация (`/api/auth`)

#### POST `/register`
Регистрация нового пользователя.

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "firstName": "Иван",
  "lastName": "Иванов",
  "middleName": "Иванович",
  "phone": "+79002003910"
}
```

**Ответ:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов",
    "middleName": "Иванович"
  },
  "token": "jwt-token"
}
```

#### POST `/login`
Вход в систему.

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "smsCode": 1353,
  "phone": "+79003002030"
}
```

**Параметры запроса:**
- Должно быть передано либо email, либо phone. Зависит от способа входа.
- Должно быть передано либо password, либо smsCode. Зависит от способа входа.


#### POST `/logout`
Выход из системы. Требует авторизации.

#### GET `/verify`
Проверка токена. Требует авторизации.

### 👤 Профиль пользователя (`/api/profile`)

Все маршруты требуют авторизации.

#### GET `/`
Получение профиля пользователя.

**Ответ:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов",
    "middleName": "Иванович",
    "phone": "+7 (999) 123-45-67",
    "isActive": true,
    "isVerified": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "passport": {
    "series": "1234",
    "number": "567890",
    "issuedBy": "ОУФМС России по г. Москве",
    "issueDate": "2020-01-15",
    "departmentCode": "123456",
    "gender": "male",
    "birthDate": "1990-05-20"
  },
  "documents": [],
  "accounts": []
}
```

#### PUT `/`
Обновление профиля.

**Тело запроса:**
```json
{
  "firstName": "Иван",
  "lastName": "Иванов",
  "middleName": "Иванович",
  "phone": "+7 (999) 123-45-67"
}
```

#### PUT `/passport`
Обновление паспортных данных.

**Тело запроса:**
```json
{
  "series": "1234",
  "number": "567890",
  "issuedBy": "ОУФМС России по г. Москве",
  "issueDate": "2020-01-15",
  "departmentCode": "123456",
  "gender": "male",
  "birthDate": "1990-05-20"
}
```

#### POST `/documents`
Загрузка документа.

**Тело запроса:**
```json
{
  "documentType": "passport",
  "fileName": "passport.pdf",
  "filePath": "/uploads/passport.pdf",
  "fileSize": 1024000,
  "mimeType": "application/pdf"
}
```

#### GET `/documents`
Получение списка документов.

#### DELETE `/documents/:documentId`
Удаление документа.

### 💰 Счета (`/api/accounts`)

Все маршруты требуют авторизации.

#### GET `/`
Получение всех счетов пользователя с общей суммой средств.

**Ответ:**
```json
{
  "accounts": [
    {
      "id": 1,
      "account_number": "PI00000001",
      "balance": "100000.00",
      "currency": "RUB",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "bank": "Сбербанк России",
      "bik_or_bankname": "044525225",
      "number": "40817810123456789012",
      "bankname": "Сбербанк (ПАО)",
      "inn": "7707083893",
      "kpp": "770701001",
      "corp_bank_account": "40702810123456789012"
    }
  ],
  "totalBalance": 150000.00
}
```

**Описание полей:**
- `totalBalance` - общая сумма средств по всем активным счетам пользователя
- `bank` - название банка (обязательное поле)
- `bik_or_bankname` - БИК банка или название банка (обязательное поле)
- `number` - номер банковской карты или счета (опциональное)
- `bankname` - полное название банка (опциональное)
- `inn` - ИНН банка (опциональное, 10 или 12 цифр)
- `kpp` - КПП банка (опциональное, 9 цифр)
- `corp_bank_account` - корпоративный банковский счет (опциональное)

#### GET `/stats`
Получение статистики по счетам.

**Ответ:**
```json
{
  "totalBalance": 150000,
  "accountsCount": 2,
  "operations": {
    "total": 5,
    "deposits": 200000,
    "withdrawals": 50000
  },
  "profitability": {
    "annual": 12.5,
    "monthly": 1.04
  }
}
```

#### POST `/`
Создание нового счета с банковскими реквизитами.

**Тело запроса:**
```json
{
  "bank": "Сбербанк России",
  "bik_or_bankname": "044525225",
  "currency": "RUB",
  "number": "40817810123456789012",
  "bankname": "Сбербанк (ПАО)",
  "inn": "7707083893",
  "kpp": "770701001",
  "corp_bank_account": "40702810123456789012"
}
```

**Обязательные поля:**
- `bank` (string) - название банка
- `bik_or_bankname` (string) - БИК банка или название банка
- `currency` (string) - валюта счета (по умолчанию "RUB")

**Опциональные поля:**
- `number` (string) - номер банковской карты или счета
- `bankname` (string) - полное название банка
- `inn` (string) - ИНН банка (10 или 12 цифр)
- `kpp` (string) - КПП банка (9 цифр)
- `corp_bank_account` (string) - корпоративный банковский счет

**Ответ:**
```json
{
  "message": "Account created successfully",
  "account": {
    "id": 2,
    "account_number": "PI00000002",
    "balance": "0.00",
    "currency": "RUB",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "bank": "Сбербанк России",
    "bik_or_bankname": "044525225",
    "number": "40817810123456789012",
    "bankname": "Сбербанк (ПАО)",
    "inn": "7707083893",
    "kpp": "770701001",
    "corp_bank_account": "40702810123456789012"
  }
}
```

#### GET `/:accountId`
Получение конкретного счета со всеми полями.

**Ответ:**
```json
{
  "account": {
    "id": 1,
    "account_number": "PI00000001",
    "balance": "100000.00",
    "currency": "RUB",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z",
    "bank": "Сбербанк России",
    "bik_or_bankname": "044525225",
    "number": "40817810123456789012",
    "bankname": "Сбербанк (ПАО)",
    "inn": "7707083893",
    "kpp": "770701001",
    "corp_bank_account": "40702810123456789012"
  }
}
```

### 💸 Операции (`/api/operations`)

Все маршруты требуют авторизации.

#### POST `/deposit`
Создание заявки на пополнение.

**Тело запроса:**
```json
{
  "amount": 50000,
  "comment": "Пополнение счета",
  "contactMethod": "email"
}
```

**Ответ:**
```json
{
  "message": "Deposit request created successfully",
  "operation": {
    "id": 1,
    "type": "deposit",
    "amount": "50000.00",
    "status": "created",
    "comment": "Пополнение счета",
    "contactMethod": "email",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### POST `/withdrawal`
Создание заявки на вывод средств.

**Тело запроса:**
```json
{
  "amount": 10000,
  "recipientDetails": {
    "bankName": "Сбербанк",
    "accountNumber": "40817810123456789012",
    "bik": "044525225"
  },
  "comment": "Вывод средств"
}
```

#### GET `/`
Получение истории операций.

**Параметры запроса:**
- `page` - номер страницы (по умолчанию 1)
- `limit` - количество записей на странице (по умолчанию 10)
- `status` - фильтр по статусу (created, processing, completed, rejected)
- `type` - фильтр по типу (deposit, withdrawal)

**Ответ:**
```json
{
  "operations": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

#### GET `/:operationId`
Получение конкретной операции.

### 👨‍💼 Админские функции (`/api/admin`)

Все маршруты требуют авторизации и админских прав.

#### GET `/operations`
Получение всех операций в системе.

**Параметры запроса:**
- `page` - номер страницы
- `limit` - количество записей на странице
- `status` - фильтр по статусу
- `type` - фильтр по типу
- `userId` - фильтр по пользователю

#### PUT `/operations/:operationId/status`
Обновление статуса операции.

**Тело запроса:**
```json
{
  "status": "completed",
  "adminComment": "Операция успешно завершена"
}
```

**Доступные статусы:**
- `created` - создана
- `processing` - в обработке
- `completed` - исполнена
- `rejected` - отклонена

#### GET `/stats`
Получение административной статистики.

**Ответ:**
```json
{
  "operations": {
    "total_operations": 100,
    "pending_operations": 5,
    "processing_operations": 3,
    "completed_operations": 90,
    "rejected_operations": 2,
    "total_deposits": "5000000.00",
    "total_withdrawals": "2000000.00"
  },
  "users": {
    "total_users": 50,
    "active_users": 48,
    "new_users_30_days": 10
  },
  "accounts": {
    "total_accounts": 50,
    "total_balance": "3000000.00",
    "avg_balance": "60000.00"
  },
  "recentOperations": [...]
}
```

#### GET `/users`
Получение всех пользователей.

**Параметры запроса:**
- `page` - номер страницы
- `limit` - количество записей на странице
- `search` - поиск по email, имени или фамилии

#### PUT `/users/:userId/status`
Блокировка/разблокировка пользователя.

**Тело запроса:**
```json
{
  "isActive": false
}
```

## Коды ошибок

- `400` - Неверный запрос (ошибки валидации)
- `401` - Не авторизован
- `403` - Доступ запрещен
- `404` - Ресурс не найден
- `500` - Внутренняя ошибка сервера

## Валидация

### Пароль
- Минимум 8 символов
- Должен содержать минимум одну заглавную букву, одну строчную букву и одну цифру

### Email
- Должен быть валидным email адресом

### Телефон
- Должен быть валидным российским номером телефона

### Сумма операций
- Минимум 1000 RUB для пополнения и вывода

### Счета (новые поля)
- `bank` - обязательное поле, непустая строка
- `bik_or_bankname` - обязательное поле, непустая строка
- `currency` - строка, по умолчанию "RUB"
- `number` - опциональное поле, максимум 255 символов
- `bankname` - опциональное поле, максимум 255 символов
- `inn` - опциональное поле, должно содержать 10 или 12 цифр
- `kpp` - опциональное поле, должно содержать ровно 9 цифр
- `corp_bank_account` - опциональное поле, максимум 255 символов

**Примеры валидных значений:**
```json
{
  "inn": "7707083893",        // 10 цифр для ИП
  "inn": "770708389301",      // 12 цифр для ООО
  "kpp": "770701001"          // 9 цифр
}
```

## Email уведомления

Система автоматически отправляет email уведомления при:
- Регистрации пользователя
- Создании заявки на операцию
- Изменении статуса операции
- Создании новых заявок (администратору)

## База данных

### Основные таблицы:
- `users` - пользователи
- `user_passports` - паспортные данные
- `user_documents` - документы пользователей
- `user_accounts` - счета пользователей
- `operations` - операции
- `operation_history` - история изменений операций
- `password_reset_tokens` - токены восстановления пароля
- `user_sessions` - сессии пользователей

### Таблица `user_accounts` (обновлена):
```sql
CREATE TABLE user_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  account_number VARCHAR(50) UNIQUE NOT NULL,
  balance DECIMAL(15,2) DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'RUB',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Новые поля для банковских реквизитов
  bank VARCHAR(255) NOT NULL,                    -- Название банка (обязательное)
  bik_or_bankname VARCHAR(255) NOT NULL,         -- БИК или название банка (обязательное)
  number VARCHAR(255),                           -- Номер карты/счета (опциональное)
  bankname VARCHAR(255),                         -- Полное название банка (опциональное)
  inn VARCHAR(20),                               -- ИНН банка (опциональное)
  kpp VARCHAR(20),                               -- КПП банка (опциональное)
  corp_bank_account VARCHAR(255)                 -- Корпоративный счет (опциональное)
);
```

## Примеры использования новых функций счетов

### Создание счета с минимальными данными
```bash
curl -X POST http://localhost:5000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bank": "Сбербанк России",
    "bik_or_bankname": "044525225",
    "currency": "RUB"
  }'
```

### Создание счета со всеми полями
```bash
curl -X POST http://localhost:5000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bank": "ВТБ",
    "bik_or_bankname": "044525187",
    "currency": "USD",
    "number": "40817810123456789012",
    "bankname": "ВТБ (ПАО)",
    "inn": "7702070139",
    "kpp": "770201001",
    "corp_bank_account": "40702810123456789012"
  }'
```

### Получение всех счетов с общей суммой
```bash
curl -X GET http://localhost:5000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Ответ:**
```json
{
  "accounts": [
    {
      "id": 1,
      "account_number": "PI00000001",
      "balance": "100000.00",
      "currency": "RUB",
      "bank": "Сбербанк России",
      "bik_or_bankname": "044525225"
    },
    {
      "id": 2,
      "account_number": "PI00000002", 
      "balance": "50000.00",
      "currency": "USD",
      "bank": "ВТБ",
      "bik_or_bankname": "044525187"
    }
  ],
  "totalBalance": 150000.00
}
```

### Обработка ошибок валидации
```bash
# Неверный ИНН
curl -X POST http://localhost:5000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bank": "Тест Банк",
    "bik_or_bankname": "123456789",
    "inn": "123"
  }'
```

**Ответ при ошибке:**
```json
{
  "message": "Validation failed",
  "errors": [
    "INN must be 10 or 12 digits"
  ]
}
```

## Безопасность

- JWT токены для аутентификации
- Хеширование паролей с помощью bcrypt
- Rate limiting для защиты от DDoS
- Валидация всех входящих данных
- CORS настройки
- Helmet для безопасности заголовков