const pool = require('../config/database');

// Получение счетов пользователя
const getAccounts = async (req, res) => {
  const userId = req.user.id;

  try {
    // Получаем все счета пользователя с новыми полями
    const result = await pool.query(
      `SELECT id, account_number, balance, currency, is_active, created_at, updated_at,
              bank, bik_or_bankname, number, bankname, inn, kpp, corp_bank_account
       FROM user_accounts 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    // Вычисляем общую сумму средств по всем счетам
    const totalBalanceResult = await pool.query(
      'SELECT SUM(balance) as total_balance FROM user_accounts WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    const totalBalance = parseFloat(totalBalanceResult.rows[0].total_balance || 0);

    res.json({
      accounts: result.rows,
      totalBalance: totalBalance
    });

  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ message: 'Failed to get accounts' });
  }
};

// Получение конкретного счета
const getAccount = async (req, res) => {
  const userId = req.user.id;
  const { accountId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, account_number, balance, currency, is_active, created_at, updated_at,
              bank, bik_or_bankname, number, bankname, inn, kpp, corp_bank_account
       FROM user_accounts 
       WHERE id = $1 AND user_id = $2`,
      [accountId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json({
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ message: 'Failed to get account' });
  }
};

// Создание нового счета
const createAccount = async (req, res) => {
  const userId = req.user.id;
  const { 
    bank, 
    bik_or_bankname, 
    currency = 'RUB',
    number,
    bankname,
    inn,
    kpp,
    corp_bank_account
  } = req.body;

  // Валидация обязательных полей
  if (!bank || !bik_or_bankname) {
    return res.status(400).json({ 
      message: 'Bank and BIK or bank name are required fields' 
    });
  }

  try {
    // Генерируем номер счета
    const accountCount = await pool.query(
      'SELECT COUNT(*) as count FROM user_accounts WHERE user_id = $1',
      [userId]
    );
    
    const accountNumber = `PI${userId.toString().padStart(8, '0')}${(parseInt(accountCount.rows[0].count) + 1).toString().padStart(2, '0')}`;

    const result = await pool.query(
      `INSERT INTO user_accounts (
        user_id, account_number, currency, bank, bik_or_bankname,
        number, bankname, inn, kpp, corp_bank_account
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, account_number, balance, currency, is_active, created_at,
                 bank, bik_or_bankname, number, bankname, inn, kpp, corp_bank_account`,
      [userId, accountNumber, currency, bank, bik_or_bankname,
       number || null, bankname || null, inn || null, kpp || null, corp_bank_account || null]
    );

    res.status(201).json({
      message: 'Account created successfully',
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ message: 'Failed to create account' });
  }
};

// Получение статистики по счетам
const getAccountStats = async (req, res) => {
  const userId = req.user.id;

  try {
    // Общий баланс по всем счетам
    const balanceResult = await pool.query(
      'SELECT SUM(balance) as total_balance FROM user_accounts WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // Количество активных счетов
    const accountsCountResult = await pool.query(
      'SELECT COUNT(*) as accounts_count FROM user_accounts WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // Статистика по операциям за последние 30 дней
    const operationsResult = await pool.query(
      `SELECT 
         COUNT(*) as total_operations,
         SUM(CASE WHEN operation_type = 'deposit' THEN amount ELSE 0 END) as total_deposits,
         SUM(CASE WHEN operation_type = 'withdrawal' THEN amount ELSE 0 END) as total_withdrawals
       FROM operations 
       WHERE user_id = $1 
       AND created_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );

    // Доходность (заглушка - в реальном проекте будет рассчитываться на основе торговых операций)
    const profitability = 12.5; // 12.5% годовых

    res.json({
      totalBalance: parseFloat(balanceResult.rows[0].total_balance || 0),
      accountsCount: parseInt(accountsCountResult.rows[0].accounts_count),
      operations: {
        total: parseInt(operationsResult.rows[0].total_operations),
        deposits: parseFloat(operationsResult.rows[0].total_deposits || 0),
        withdrawals: parseFloat(operationsResult.rows[0].total_withdrawals || 0)
      },
      profitability: {
        annual: profitability,
        monthly: profitability / 12
      }
    });

  } catch (error) {
    console.error('Get account stats error:', error);
    res.status(500).json({ message: 'Failed to get account statistics' });
  }
};

module.exports = {
  getAccounts,
  getAccount,
  createAccount,
  getAccountStats
};