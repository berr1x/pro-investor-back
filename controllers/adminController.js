const pool = require('../config/database');
const emailService = require('../utils/emailService');

// Начисление средств по операции пополнения
const processDeposit = async (req, res) => {
  const { operationId } = req.params;
  const { amount, adminComment } = req.body;

  try {
    // Начинаем транзакцию
    await pool.query('BEGIN');

    // Получаем операцию
    const operationResult = await pool.query(
      `SELECT o.id, o.operation_type, o.amount, o.currency, o.status, o.user_id, o.account_id,
              o.recipient_details, o.comment,
              CASE 
                WHEN ua.id IS NOT NULL THEN ua.number
                WHEN uta.id IS NOT NULL THEN uta.account_number
                ELSE NULL
              END as account_number,
              COALESCE(ua.balance, uta.profit) as current_balance,
              u.first_name, u.last_name, u.email,
              CASE 
                WHEN ua.id IS NOT NULL THEN 'banking'
                WHEN uta.id IS NOT NULL THEN 'trading'
                ELSE 'unknown'
              END as account_type
       FROM operations o
       LEFT JOIN user_accounts ua ON o.account_id = ua.id
       LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [operationId]
    );

    if (operationResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ message: 'Operation not found' });
    }

    const operation = operationResult.rows[0];

    // Проверяем, что это операция пополнения со статусом "created"
    if (operation.operation_type !== 'deposit') {
      await pool.query('ROLLBACK');
      return res.status(400).json({ message: 'Operation is not a deposit' });
    }

    if (operation.status !== 'created') {
      await pool.query('ROLLBACK');
      return res.status(400).json({ message: 'Operation is not in created status' });
    }

    // Валидация суммы
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid amount. Amount must be a positive number' });
    }

    const depositAmount = parseFloat(amount);

    // Обновляем баланс пользователя в зависимости от типа счета
    const newBalance = parseFloat(operation.current_balance) + depositAmount;
    
    if (operation.account_type === 'banking') {
      await pool.query(
        'UPDATE user_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newBalance.toFixed(2), operation.account_id]
      );
    } else if (operation.account_type === 'trading') {
      await pool.query(
        'UPDATE user_trading_accounts SET profit = $1, updated_at = NOW() WHERE id = $2',
        [newBalance.toFixed(2), operation.account_id]
      );
    } else {
      await pool.query('ROLLBACK');
      return res.status(400).json({ message: 'Unknown account type' });
    }

    // Обновляем статус операции и сумму
    await pool.query(
      'UPDATE operations SET status = $1, amount = $2, admin_comment = $3, updated_at = NOW() WHERE id = $4',
      ['completed', depositAmount.toFixed(2), adminComment || 'Средства успешно начислены', operationId]
    );

    // Отправляем уведомление пользователю (опционально)
    try {
      await emailService.sendEmail({
        to: operation.email,
        subject: 'Пополнение счета выполнено',
        text: `Здравствуйте, ${operation.first_name}!\n\nВаш счет ${operation.account_number} был пополнен на сумму ${depositAmount.toFixed(2)} ${operation.currency}.\nНовый баланс: ${newBalance.toFixed(2)} ${operation.currency}.\n\nСпасибо за использование наших услуг!`
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Не прерываем транзакцию из-за ошибки email
    }

    // Подтверждаем транзакцию
    await pool.query('COMMIT');

    res.json({
      message: 'Deposit processed successfully',
      operation: {
        id: operation.id,
        status: 'completed',
        amount: depositAmount.toFixed(2),
        newBalance: newBalance.toFixed(2)
      }
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Process deposit error:', error);
    res.status(500).json({ message: 'Failed to process deposit' });
  }
};

// Получение всех операций (для администратора)
const getAllOperations = async (req, res) => {
  const { page = 1, limit = 20, status, type, userId } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT o.id, o.operation_type, o.amount, o.currency, o.status, 
             o.comment, o.admin_comment, o.recipient_details, o.contact_method,
             o.created_at, o.updated_at,
             CASE 
               WHEN ua.id IS NOT NULL THEN ua.number
               WHEN uta.id IS NOT NULL THEN uta.account_number
               ELSE NULL
             END as account_number,
             u.first_name, u.last_name, u.email,
             CASE 
               WHEN ua.id IS NOT NULL THEN 'banking'
               WHEN uta.id IS NOT NULL THEN 'trading'
               ELSE 'unknown'
             END as account_type
      FROM operations o
      LEFT JOIN user_accounts ua ON o.account_id = ua.id
      LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND o.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (type) {
      paramCount++;
      query += ` AND o.operation_type = $${paramCount}`;
      queryParams.push(type);
    }

    if (userId) {
      paramCount++;
      query += ` AND o.user_id = $${paramCount}`;
      queryParams.push(userId);
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Получаем общее количество операций для пагинации
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM operations o
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (status) {
      countParamCount++;
      countQuery += ` AND o.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (type) {
      countParamCount++;
      countQuery += ` AND o.operation_type = $${countParamCount}`;
      countParams.push(type);
    }

    if (userId) {
      countParamCount++;
      countQuery += ` AND o.user_id = $${countParamCount}`;
      countParams.push(userId);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      operations: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get all operations error:', error);
    res.status(500).json({ message: 'Failed to get operations' });
  }
};

// Обновление статуса операции
const updateOperationStatus = async (req, res) => {
  const { operationId } = req.params;
  const { status, adminComment } = req.body;

  const validStatuses = ['created', 'processing', 'completed', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    // Получаем текущую операцию
    const currentOperation = await pool.query(
      `SELECT o.*, u.first_name, u.last_name, u.email
       FROM operations o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [operationId]
    );

    if (currentOperation.rows.length === 0) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    const operation = currentOperation.rows[0];
    const oldStatus = operation.status;

    // Обновляем статус операции
    const result = await pool.query(
      `UPDATE operations 
       SET status = $1, admin_comment = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, adminComment, operationId]
    );

    // Записываем в историю
    await pool.query(
      `INSERT INTO operation_history (operation_id, status_from, status_to, comment)
       VALUES ($1, $2, $3, $4)`,
      [operationId, oldStatus, status, adminComment]
    );

    // Если операция завершена, обновляем баланс счета
    if (status === 'completed') {
      if (operation.operation_type === 'deposit') {
        // Увеличиваем баланс при пополнении
        await pool.query(
          'UPDATE user_accounts SET balance = balance + $1 WHERE id = $2',
          [operation.amount, operation.account_id]
        );
      } else if (operation.operation_type === 'withdrawal') {
        // Уменьшаем баланс при выводе
        await pool.query(
          'UPDATE user_accounts SET balance = balance - $1 WHERE id = $2',
          [operation.amount, operation.account_id]
        );
      }
    }

    // Отправляем уведомление пользователю
    try {
      await emailService.sendOperationNotification(
        operation.email,
        operation.first_name,
        operation.operation_type,
        operation.amount,
        status
      );
    } catch (emailError) {
      console.error('Failed to send notification:', emailError);
    }

    res.json({
      message: 'Operation status updated successfully',
      operation: result.rows[0]
    });

  } catch (error) {
    console.error('Update operation status error:', error);
    res.status(500).json({ message: 'Failed to update operation status' });
  }
};

// Получение статистики для администратора
const getAdminStats = async (req, res) => {
  try {
    // Общая статистика по операциям
    const operationsStats = await pool.query(`
      SELECT 
        COUNT(*) as total_operations,
        COUNT(CASE WHEN operation_type = 'deposit' THEN 1 END) as deposit_operations,
        COUNT(CASE WHEN operation_type = 'withdrawal' THEN 1 END) as withdrawal_operations,
        COUNT(CASE WHEN status = 'created' THEN 1 END) as pending_operations,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_operations,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_operations,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_operations,
        SUM(CASE WHEN operation_type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN operation_type = 'withdrawal' AND status = 'completed' THEN amount ELSE 0 END) as total_withdrawals
      FROM operations
    `);

    // Статистика по пользователям
    const usersStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN is_active = false THEN 1 END) as blocked_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30_days
      FROM users
    `);

    // Статистика по банковским счетам
    const bankAccountsStats = await pool.query(`
      SELECT 
        COUNT(*) as bank_accounts,
        COALESCE(SUM(balance), 0) as bank_balance
      FROM user_accounts
      WHERE is_active = true
    `);

    // Статистика по торговым счетам
    const tradingAccountsStats = await pool.query(`
      SELECT 
        COUNT(*) as trading_accounts,
        COALESCE(SUM(profit), 0) as trading_balance
      FROM user_trading_accounts
      WHERE status = 'active'
    `);

    // Операции за последние 7 дней
    const recentOperations = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as operations_count,
        SUM(CASE WHEN operation_type = 'deposit' THEN amount ELSE 0 END) as deposits,
        SUM(CASE WHEN operation_type = 'withdrawal' THEN amount ELSE 0 END) as withdrawals
      FROM operations
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    const operations = operationsStats.rows[0];
    const users = usersStats.rows[0];
    const bankAccounts = bankAccountsStats.rows[0];
    const tradingAccounts = tradingAccountsStats.rows[0];

    res.json({
      // Пользователи
      totalUsers: parseInt(users.total_users) || 0,
      activeUsers: parseInt(users.active_users) || 0,
      blockedUsers: parseInt(users.blocked_users) || 0,
      newUsers30Days: parseInt(users.new_users_30_days) || 0,

      // Счета
      totalAccounts: (parseInt(bankAccounts.bank_accounts) || 0) + (parseInt(tradingAccounts.trading_accounts) || 0),
      bankAccounts: parseInt(bankAccounts.bank_accounts) || 0,
      tradingAccounts: parseInt(tradingAccounts.trading_accounts) || 0,

      // Операции
      totalOperations: parseInt(operations.total_operations) || 0,
      depositOperations: parseInt(operations.deposit_operations) || 0,
      withdrawalOperations: parseInt(operations.withdrawal_operations) || 0,
      pendingOperations: parseInt(operations.pending_operations) || 0,
      processingOperations: parseInt(operations.processing_operations) || 0,
      completedOperations: parseInt(operations.completed_operations) || 0,
      rejectedOperations: parseInt(operations.rejected_operations) || 0,

      // Балансы
      totalBalance: (parseFloat(bankAccounts.bank_balance) || 0) + (parseFloat(tradingAccounts.trading_balance) || 0),
      bankBalance: parseFloat(bankAccounts.bank_balance) || 0,
      tradingBalance: parseFloat(tradingAccounts.trading_balance) || 0,
      totalDeposits: parseFloat(operations.total_deposits) || 0,
      totalWithdrawals: parseFloat(operations.total_withdrawals) || 0,

      // Дополнительные данные
      recentOperations: recentOperations.rows
    });

  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ message: 'Failed to get admin statistics' });
  }
};

// Получение всех пользователей
const getAllUsers = async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.middle_name, 
             u.phone, u.is_active, u.is_verified, u.created_at,
             COUNT(ua.id) as accounts_count,
             COALESCE(SUM(ua.balance), 0) as total_balance
      FROM users u
      LEFT JOIN user_accounts ua ON u.id = ua.user_id AND ua.is_active = true
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (u.email ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    query += ` GROUP BY u.id, u.email, u.first_name, u.last_name, u.middle_name, u.phone, u.is_active, u.is_verified, u.created_at ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Получаем общее количество пользователей
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (email ILIKE $${countParamCount} OR first_name ILIKE $${countParamCount} OR last_name ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Failed to get users' });
  }
};

// Блокировка/разблокировка пользователя
const toggleUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { isActive } = req.body;

  try {
    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, is_active',
      [isActive, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Failed to update user status' });
  }
};

// Получение всех счетов (для администратора)
const getAllAccounts = async (req, res) => {
  const { page = 1, limit = 20, userId, currency, isActive } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT uta.id, uta.account_number, uta.profit as balance, uta.currency, uta.status as is_active, 
             uta.percentage, uta.created_at, uta.updated_at,
             u.first_name, u.last_name, u.email,
             'trading' as account_type
      FROM user_trading_accounts uta
      JOIN users u ON uta.userId = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (userId) {
      paramCount++;
      query += ` AND uta.userId = $${paramCount}`;
      queryParams.push(userId);
    }

    if (currency) {
      paramCount++;
      query += ` AND uta.currency = $${paramCount}`;
      queryParams.push(currency);
    }

    if (isActive !== undefined) {
      paramCount++;
      query += ` AND uta.status = $${paramCount}`;
      queryParams.push(isActive === 'true' ? 'active' : 'inactive');
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

    if (userId) {
      countParamCount++;
      countQuery += ` AND uta.userId = $${countParamCount}`;
      countParams.push(userId);
    }

    if (currency) {
      countParamCount++;
      countQuery += ` AND uta.currency = $${countParamCount}`;
      countParams.push(currency);
    }

    if (isActive !== undefined) {
      countParamCount++;
      countQuery += ` AND uta.status = $${countParamCount}`;
      countParams.push(isActive === 'true' ? 'active' : 'inactive');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      accounts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get all accounts error:', error);
    res.status(500).json({ message: 'Failed to get accounts' });
  }
};

// Блокировка/разблокировка счета
const toggleAccountStatus = async (req, res) => {
  const { accountId } = req.params;
  const { isActive } = req.body;

  try {
    const status = isActive ? 'active' : 'inactive';
    const result = await pool.query(
      'UPDATE user_trading_accounts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, account_number, status',
      [status, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json({
      message: `Account ${isActive ? 'activated' : 'deactivated'} successfully`,
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Toggle account status error:', error);
    res.status(500).json({ message: 'Failed to update account status' });
  }
};

// Обновление баланса счета
const updateAccountBalance = async (req, res) => {
  const { accountId } = req.params;
  const { newBalance, comment } = req.body;

  try {
    // Получаем текущий счет
    const currentAccount = await pool.query(
      'SELECT * FROM user_trading_accounts WHERE id = $1',
      [accountId]
    );

    if (currentAccount.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const account = currentAccount.rows[0];
    const oldBalance = account.profit;

    // Обновляем баланс (profit для торговых счетов)
    const result = await pool.query(
      'UPDATE user_trading_accounts SET profit = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [newBalance, accountId]
    );

    // Записываем в историю изменений (если есть таблица для этого)
    // await pool.query(
    //   'INSERT INTO balance_history (account_id, old_balance, new_balance, comment, admin_id) VALUES ($1, $2, $3, $4, $5)',
    //   [accountId, oldBalance, newBalance, comment, req.user.id]
    // );

    res.json({
      message: 'Account balance updated successfully',
      account: result.rows[0],
      oldBalance,
      newBalance
    });

  } catch (error) {
    console.error('Update account balance error:', error);
    res.status(500).json({ message: 'Failed to update account balance' });
  }
};

// Получение детальной информации о пользователе
const getUserDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    // Получаем информацию о пользователе
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Получаем банковские счета пользователя
    const accountsResult = await pool.query(
      'SELECT * FROM user_accounts WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Получаем торговые счета пользователя
    const tradingAccountsResult = await pool.query(
      'SELECT * FROM user_trading_accounts WHERE userId = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Получаем паспортные данные пользователя
    const passportResult = await pool.query(
      'SELECT * FROM user_passports WHERE user_id = $1',
      [userId]
    );

    // Получаем операции пользователя за последние 30 дней
    const operationsResult = await pool.query(
      `SELECT o.*, 
              CASE 
                WHEN ua.id IS NOT NULL THEN ua.number
                WHEN uta.id IS NOT NULL THEN uta.account_number
                ELSE NULL
              END as account_number,
              CASE 
                WHEN ua.id IS NOT NULL THEN 'banking'
                WHEN uta.id IS NOT NULL THEN 'trading'
                ELSE 'unknown'
              END as account_type
       FROM operations o
       LEFT JOIN user_accounts ua ON o.account_id = ua.id
       LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
       WHERE o.user_id = $1 AND o.created_at >= NOW() - INTERVAL '30 days'
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      user,
      accounts: accountsResult.rows,
      tradingAccounts: tradingAccountsResult.rows,
      passport: passportResult.rows[0] || null,
      recentOperations: operationsResult.rows
    });

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ message: 'Failed to get user details' });
  }
};

// Обновление процента счета
const updateAccountPercentage = async (req, res) => {
  const { accountId } = req.params;
  const { percentage } = req.body;

  try {
    // Валидация процента
    if (percentage === undefined || isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0) {
      return res.status(400).json({ message: 'Invalid percentage. Must be a non-negative number' });
    }

    // Обновляем процент счета
    await pool.query(
      'UPDATE user_trading_accounts SET percentage = $1, updated_at = NOW() WHERE id = $2',
      [parseFloat(percentage), accountId]
    );

    res.json({
      message: 'Account percentage updated successfully',
      account: {
        id: accountId,
        percentage: parseFloat(percentage)
      }
    });

  } catch (error) {
    console.error('Update account percentage error:', error);
    res.status(500).json({ message: 'Failed to update account percentage' });
  }
};

// Редактирование пользователя
const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { 
    email, 
    first_name, 
    last_name, 
    middle_name, 
    phone, 
    is_active, 
    is_verified 
  } = req.body;

  try {
    // Проверяем, существует ли пользователь
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем уникальность email (если он изменился)
    if (email && email !== existingUser.rows[0].email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Валидация данных
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    if (phone && !/^\+?[1-9]\d{1,14}$/.test(phone)) {
      return res.status(400).json({ message: 'Invalid phone format' });
    }

    // Обновляем пользователя
    const result = await pool.query(
      `UPDATE users 
       SET email = COALESCE($1, email),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           middle_name = COALESCE($4, middle_name),
           phone = COALESCE($5, phone),
           is_active = COALESCE($6, is_active),
           is_verified = COALESCE($7, is_verified),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [email, first_name, last_name, middle_name, phone, is_active, is_verified, userId]
    );

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
};

// Редактирование банковского счета
const updateBankAccount = async (req, res) => {
  const { accountId } = req.params;
  const { 
    account_number, 
    balance, 
    currency, 
    bank, 
    number, 
    is_active, 
    percentage 
  } = req.body;

  try {
    // Проверяем, существует ли счет
    const existingAccount = await pool.query(
      'SELECT * FROM user_accounts WHERE id = $1',
      [accountId]
    );

    if (existingAccount.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Проверяем уникальность номера счета (если он изменился)
    if (account_number && account_number !== existingAccount.rows[0].account_number) {
      const accountCheck = await pool.query(
        'SELECT id FROM user_accounts WHERE account_number = $1 AND id != $2',
        [account_number, accountId]
      );

      if (accountCheck.rows.length > 0) {
        return res.status(400).json({ message: 'Account number already exists' });
      }
    }

    // Валидация данных
    if (balance !== undefined && (isNaN(parseFloat(balance)) || parseFloat(balance) < 0)) {
      return res.status(400).json({ message: 'Invalid balance. Must be a non-negative number' });
    }

    if (percentage !== undefined && (isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0)) {
      return res.status(400).json({ message: 'Invalid percentage. Must be a non-negative number' });
    }

    if (currency && !['RUB', 'USD', 'EUR', 'CNY'].includes(currency)) {
      return res.status(400).json({ message: 'Invalid currency. Must be RUB, USD, EUR, or CNY' });
    }

    // Обновляем счет
    const result = await pool.query(
      `UPDATE user_accounts 
       SET account_number = COALESCE($1, account_number),
           balance = COALESCE($2, balance),
           currency = COALESCE($3, currency),
           bank = COALESCE($4, bank),
           number = COALESCE($5, number),
           is_active = COALESCE($6, is_active),
           percentage = COALESCE($7, percentage),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [account_number, balance, currency, bank, number, is_active, percentage, accountId]
    );

    res.json({
      message: 'Bank account updated successfully',
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Update bank account error:', error);
    res.status(500).json({ message: 'Failed to update bank account' });
  }
};

// Редактирование торгового счета
const updateTradingAccount = async (req, res) => {
  const { accountId } = req.params;
  const { 
    account_number, 
    profit, 
    percentage, 
    currency, 
    status 
  } = req.body;

  try {
    // Проверяем, существует ли счет
    const existingAccount = await pool.query(
      'SELECT * FROM user_trading_accounts WHERE id = $1',
      [accountId]
    );

    if (existingAccount.rows.length === 0) {
      return res.status(404).json({ message: 'Trading account not found' });
    }

    // Проверяем уникальность номера счета (если он изменился)
    if (account_number && account_number !== existingAccount.rows[0].account_number) {
      const accountCheck = await pool.query(
        'SELECT id FROM user_trading_accounts WHERE account_number = $1 AND id != $2',
        [account_number, accountId]
      );

      if (accountCheck.rows.length > 0) {
        return res.status(400).json({ message: 'Account number already exists' });
      }
    }

    // Валидация данных
    if (profit !== undefined && (isNaN(parseFloat(profit)))) {
      return res.status(400).json({ message: 'Invalid profit. Must be a number' });
    }

    if (percentage !== undefined && (isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0)) {
      return res.status(400).json({ message: 'Invalid percentage. Must be a non-negative number' });
    }

    if (currency && !['RUB', 'USD', 'EUR', 'CNY'].includes(currency)) {
      return res.status(400).json({ message: 'Invalid currency. Must be RUB, USD, EUR, or CNY' });
    }

    if (status && !['active', 'inactive', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be active, inactive, or closed' });
    }

    // Обновляем счет
    const result = await pool.query(
      `UPDATE user_trading_accounts 
       SET account_number = COALESCE($1, account_number),
           profit = COALESCE($2, profit),
           percentage = COALESCE($3, percentage),
           currency = COALESCE($4, currency),
           status = COALESCE($5, status),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [account_number, profit, percentage, currency, status, accountId]
    );

    res.json({
      message: 'Trading account updated successfully',
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Update trading account error:', error);
    res.status(500).json({ message: 'Failed to update trading account' });
  }
};

// Обновление паспортных данных пользователя
const updateUserPassport = async (req, res) => {
  const { userId } = req.params;
  const { 
    series, 
    number, 
    issued_by, 
    issue_date, 
    department_code, 
    gender, 
    birth_date 
  } = req.body;

  try {
    // Проверяем, существует ли пользователь
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Валидация данных
    if (series && series.length > 10) {
      return res.status(400).json({ message: 'Series must be 10 characters or less' });
    }

    if (number && number.length > 20) {
      return res.status(400).json({ message: 'Number must be 20 characters or less' });
    }

    if (department_code && department_code.length > 10) {
      return res.status(400).json({ message: 'Department code must be 10 characters or less' });
    }

    if (gender && !['male', 'female', 'мужской', 'женский'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid gender. Must be male, female, мужской, or женский' });
    }

    // Проверяем, есть ли уже паспортные данные
    const existingPassport = await pool.query(
      'SELECT id FROM user_passports WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existingPassport.rows.length > 0) {
      // Обновляем существующие данные
      result = await pool.query(
        `UPDATE user_passports 
         SET series = COALESCE($1, series),
             number = COALESCE($2, number),
             issued_by = COALESCE($3, issued_by),
             issue_date = COALESCE($4::date, issue_date),
             department_code = COALESCE($5, department_code),
             gender = COALESCE($6, gender),
             birth_date = COALESCE($7::date, birth_date),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $8
         RETURNING *`,
        [series, number, issued_by, issue_date, department_code, gender, birth_date, userId]
      );
    } else {
      // Создаем новые данные
      result = await pool.query(
        `INSERT INTO user_passports 
         (user_id, series, number, issued_by, issue_date, department_code, gender, birth_date)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8::date)
         RETURNING *`,
        [userId, series, number, issued_by, issue_date, department_code, gender, birth_date]
      );
    }

    res.json({
      message: 'Passport data updated successfully',
      passport: result.rows[0]
    });

  } catch (error) {
    console.error('Update user passport error:', error);
    res.status(500).json({ message: 'Failed to update passport data' });
  }
};

// Обновление операции
const updateOperation = async (req, res) => {
  const { operationId } = req.params;
  const { 
    amount, 
    currency, 
    status, 
    comment, 
    admin_comment, 
    recipient_details, 
    contact_method 
  } = req.body;

  try {
    // Проверяем, существует ли операция
    const existingOperation = await pool.query(
      'SELECT * FROM operations WHERE id = $1',
      [operationId]
    );

    if (existingOperation.rows.length === 0) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    const operation = existingOperation.rows[0];

    // Валидация данных
    if (amount && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    if (currency && !['RUB', 'USD', 'EUR', 'CNY'].includes(currency)) {
      return res.status(400).json({ message: 'Invalid currency. Must be RUB, USD, EUR, or CNY' });
    }

    if (status && !['created', 'processing', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be created, processing, completed, or rejected' });
    }

    // Обновляем операцию
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    if (amount !== undefined) {
      paramCount++;
      updateFields.push(`amount = $${paramCount}`);
      updateValues.push(parseFloat(amount).toFixed(2));
    }

    if (currency !== undefined) {
      paramCount++;
      updateFields.push(`currency = $${paramCount}`);
      updateValues.push(currency);
    }

    if (status !== undefined) {
      paramCount++;
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(status);
    }

    if (comment !== undefined) {
      paramCount++;
      updateFields.push(`comment = $${paramCount}`);
      updateValues.push(comment);
    }

    if (admin_comment !== undefined) {
      paramCount++;
      updateFields.push(`admin_comment = $${paramCount}`);
      updateValues.push(admin_comment);
    }

    if (recipient_details !== undefined) {
      paramCount++;
      updateFields.push(`recipient_details = $${paramCount}`);
      updateValues.push(JSON.stringify(recipient_details));
    }

    if (contact_method !== undefined) {
      paramCount++;
      updateFields.push(`contact_method = $${paramCount}`);
      updateValues.push(contact_method);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Добавляем updated_at (не является параметром)
    updateFields.push(`updated_at = NOW()`);

    // Добавляем ID операции
    paramCount++;
    updateValues.push(operationId);

    const updateQuery = `
      UPDATE operations 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, updateValues);

    res.json({
      message: 'Operation updated successfully',
      operation: result.rows[0]
    });

  } catch (error) {
    console.error('Update operation error:', error);
    res.status(500).json({ message: 'Failed to update operation' });
  }
};

module.exports = {
  processDeposit,
  getAllOperations,
  updateOperationStatus,
  updateOperation,
  getAdminStats,
  getAllUsers,
  toggleUserStatus,
  getAllAccounts,
  toggleAccountStatus,
  updateAccountBalance,
  updateAccountPercentage,
  getUserDetails,
  updateUser,
  updateBankAccount,
  updateTradingAccount,
  updateUserPassport
};