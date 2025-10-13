const pool = require('../config/database');

// Получение всех торговых счетов с пагинацией и фильтрами
const getAllTradingAccounts = async (req, res) => {
  const { page = 1, limit = 20, search, isActive, currency } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT uta.id, uta.account_number, uta.profit, uta.profit as balance, uta.deposit_amount, uta.currency, uta.status as is_active, 
             uta.percentage, uta.created_at, uta.updated_at,
             u.first_name, u.last_name, u.email
      FROM user_trading_accounts uta
      JOIN users u ON uta.userId = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (uta.account_number ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    if (isActive !== undefined) {
      paramCount++;
      query += ` AND uta.status = $${paramCount}`;
      queryParams.push(isActive === 'true' ? 'active' : 'inactive');
    }

    if (currency) {
      paramCount++;
      query += ` AND uta.currency = $${paramCount}`;
      queryParams.push(currency);
    }

    query += ` ORDER BY uta.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Получаем общее количество счетов для пагинации
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM user_trading_accounts uta
      JOIN users u ON uta.userId = u.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (uta.account_number ILIKE $${countParamCount} OR u.first_name ILIKE $${countParamCount} OR u.last_name ILIKE $${countParamCount} OR u.email ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (isActive !== undefined) {
      countParamCount++;
      countQuery += ` AND uta.status = $${countParamCount}`;
      countParams.push(isActive === 'true' ? 'active' : 'inactive');
    }

    if (currency) {
      countParamCount++;
      countQuery += ` AND uta.currency = $${countParamCount}`;
      countParams.push(currency);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      accounts: result.rows,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });

  } catch (error) {
    console.error('Get all trading accounts error:', error);
    res.status(500).json({ message: 'Failed to get trading accounts' });
  }
};

// Создание торгового счета
const createTradingAccount = async (req, res) => {
  const { userId, currency = 'USD', percentage = 0.00, deposit_amount = 0.00 } = req.body;

  try {
    // Валидация данных
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    if (currency && !['RUB', 'USD', 'EUR'].includes(currency)) {
      return res.status(400).json({ message: 'Invalid currency. Must be RUB, USD, or EUR.' });
    }
    if (percentage !== undefined && (isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0 || parseFloat(percentage) > 100)) {
      return res.status(400).json({ message: 'Invalid percentage. Must be between 0 and 100.' });
    }
    if (deposit_amount !== undefined && (isNaN(parseFloat(deposit_amount)) || parseFloat(deposit_amount) < 0)) {
      return res.status(400).json({ message: 'Invalid deposit amount. Must be a non-negative number.' });
    }

    // Проверяем, существует ли пользователь
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Генерируем уникальный номер счета
    const generateAccountNumber = () => {
      const prefix = 'TR';
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `${prefix}${timestamp}${random}`;
    };

    let accountNumber;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      accountNumber = generateAccountNumber();
      const existing = await pool.query(
        'SELECT id FROM user_trading_accounts WHERE account_number = $1',
        [accountNumber]
      );
      if (existing.rows.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ message: 'Failed to generate unique account number' });
    }

    // Создаем торговый счет
    const result = await pool.query(
      `INSERT INTO user_trading_accounts (userId, account_number, currency, profit, deposit_amount, percentage, status)
       VALUES ($1, $2, $3, 0.00, $4, $5, 'active')
       RETURNING *`,
      [userId, accountNumber, currency, parseFloat(deposit_amount), parseFloat(percentage)]
    );

    res.status(201).json({
      message: 'Trading account created successfully',
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Create trading account error:', error);
    res.status(500).json({ message: 'Failed to create trading account' });
  }
};

// Обновление торгового счета
const updateTradingAccount = async (req, res) => {
  const { accountId } = req.params;
  const { account_number, profit, deposit_amount, percentage, currency, status } = req.body;

  try {
    // Валидация данных
    if (profit !== undefined && (isNaN(parseFloat(profit)) || parseFloat(profit) < 0)) {
      return res.status(400).json({ message: 'Invalid profit. Must be a non-negative number.' });
    }
    if (deposit_amount !== undefined && (isNaN(parseFloat(deposit_amount)) || parseFloat(deposit_amount) < 0)) {
      return res.status(400).json({ message: 'Invalid deposit amount. Must be a non-negative number.' });
    }
    if (percentage !== undefined && (isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0 || parseFloat(percentage) > 100)) {
      return res.status(400).json({ message: 'Invalid percentage. Must be between 0 and 100.' });
    }
    if (currency && !['RUB', 'USD', 'EUR'].includes(currency)) {
      return res.status(400).json({ message: 'Invalid currency. Must be RUB, USD, or EUR.' });
    }
    if (status && !['active', 'inactive', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be active, inactive, or closed.' });
    }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (account_number !== undefined) {
      // Проверяем уникальность номера счета
      const existingAccount = await pool.query(
        'SELECT id FROM user_trading_accounts WHERE account_number = $1 AND id != $2',
        [account_number, accountId]
      );
      if (existingAccount.rows.length > 0) {
        return res.status(400).json({ message: 'Account number already exists.' });
      }
      updateFields.push(`account_number = $${paramCount++}`);
      updateValues.push(account_number);
    }
    if (profit !== undefined) {
      updateFields.push(`profit = $${paramCount++}`);
      updateValues.push(parseFloat(profit));
    }
    if (deposit_amount !== undefined) {
      updateFields.push(`deposit_amount = $${paramCount++}`);
      updateValues.push(parseFloat(deposit_amount));
    }
    if (percentage !== undefined) {
      updateFields.push(`percentage = $${paramCount++}`);
      updateValues.push(parseFloat(percentage));
    }
    if (currency !== undefined) {
      updateFields.push(`currency = $${paramCount++}`);
      updateValues.push(currency);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramCount++}`);
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(accountId); // Добавляем accountId как последний параметр для WHERE

    const query = `
      UPDATE user_trading_accounts 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Trading account not found' });
    }

    res.json({
      message: 'Trading account updated successfully',
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Update trading account error:', error);
    res.status(500).json({ message: 'Failed to update trading account' });
  }
};

// Переключение статуса торгового счета
const toggleTradingAccountStatus = async (req, res) => {
  const { accountId } = req.params;
  const { isActive } = req.body;

  try {
    const status = isActive ? 'active' : 'inactive';
    const result = await pool.query(
      'UPDATE user_trading_accounts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, account_number, status',
      [status, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Trading account not found' });
    }

    res.json({
      message: `Trading account ${isActive ? 'activated' : 'deactivated'} successfully`,
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Toggle trading account status error:', error);
    res.status(500).json({ message: 'Failed to update trading account status' });
  }
};

module.exports = {
  getAllTradingAccounts,
  createTradingAccount,
  updateTradingAccount,
  toggleTradingAccountStatus
};
