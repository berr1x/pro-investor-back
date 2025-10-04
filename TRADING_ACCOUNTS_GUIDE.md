# Руководство по торговым счетам

## Обзор изменений

В системе Pro-Investor теперь реализовано разделение банковских и торговых счетов:

- **Банковские счета** (`user_accounts`) - для пополнения и вывода средств
- **Торговые счета** (`user_trading_accounts`) - для отображения инвестиционной прибыли

## Структура базы данных

### Таблица `user_trading_accounts`

```sql
CREATE TABLE user_trading_accounts (
    id SERIAL PRIMARY KEY,
    userId INTEGER NOT NULL,
    account_number VARCHAR(255) NOT NULL UNIQUE,
    profit DECIMAL(15,2) DEFAULT 0.00,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
```

## API Эндпоинты

### Торговые счета

#### `POST /api/trading-accounts`
Создание нового торгового счета

**Тело запроса:**
```json
{
  "currency": "USD"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Торговый счет успешно создан",
  "account": {
    "id": 1,
    "userId": 1,
    "account_number": "TR1696234567890",
    "profit": 0.00,
    "percentage": 0.00,
    "currency": "USD",
    "status": "active",
    "created_at": "2023-10-02T10:00:00.000Z"
  }
}
```

#### `GET /api/trading-accounts`
Получение всех торговых счетов пользователя

**Ответ:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": 1,
      "userId": 1,
      "account_number": "TR1696234567890",
      "profit": 1250.50,
      "percentage": 12.5,
      "currency": "USD",
      "status": "active",
      "created_at": "2023-10-02T10:00:00.000Z"
    }
  ]
}
```

#### `GET /api/trading-accounts/:id`
Получение конкретного торгового счета

#### `PUT /api/trading-accounts/:id/profit` (только для админов)
Обновление прибыли торгового счета

**Тело запроса:**
```json
{
  "profit": 1500.75,
  "percentage": 15.2
}
```

#### `PUT /api/trading-accounts/:id/close`
Закрытие торгового счета

### Банковские счета

Существующие эндпоинты `/api/accounts` теперь работают только с банковскими счетами.

#### `GET /api/accounts/stats`
Получение статистики по всем счетам (банковским и торговым)

**Ответ:**
```json
{
  "success": true,
  "bankAccounts": {
    "totalBalance": 50000.00,
    "count": 2
  },
  "tradingAccounts": {
    "totalProfit": 2500.75,
    "count": 3
  },
  "operations": {
    "total": 15,
    "deposits": 75000.00,
    "withdrawals": 25000.00
  },
  "profitability": {
    "average": 13.8,
    "monthly": 1.15
  }
}
```

## Фронтенд изменения

### Новая страница: `/account/trading-open`
Страница для открытия торгового счета с выбором валюты.

### Обновленная страница: `/account/expense`
- Вкладка "Торговые счета" теперь показывает торговые счета
- Вкладка "Банковские счета" показывает банковские счета
- Кнопка "Открыть счет" в торговых счетах ведет на `/account/trading-open`

## Установка и настройка

### 1. Применение миграции

```bash
cd pro-investor-back
node scripts/apply-trading-accounts-migration.js
```

### 2. Запуск тестов

```bash
# Убедитесь, что сервер запущен
npm start

# В другом терминале
node test-trading-accounts-api.js
```

### 3. Запуск фронтенда

```bash
cd pro-investor-2
npm start
```

## Ограничения и правила

1. **Один торговый счет на валюту**: Пользователь может иметь только один активный торговый счет в каждой валюте
2. **Номера счетов**: 
   - Торговые счета: префикс `TR` + timestamp + случайные цифры
   - Банковские счета: префикс `BA` + userId + порядковый номер
3. **Права доступа**: Только администраторы могут обновлять прибыль торговых счетов
4. **Валюты**: Поддерживаются USD, EUR, RUB

## Примеры использования

### Создание торгового счета (фронтенд)

```javascript
const createTradingAccount = async (currency) => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:5000/api/trading-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ currency })
  });
  
  const data = await response.json();
  return data;
};
```

### Получение торговых счетов

```javascript
const getTradingAccounts = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:5000/api/trading-accounts', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  return data.accounts;
};
```

## Безопасность

- Все эндпоинты торговых счетов требуют аутентификации
- Пользователи могут видеть только свои торговые счета
- Обновление прибыли доступно только администраторам
- Валидация входных данных на всех уровнях