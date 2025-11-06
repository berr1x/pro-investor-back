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
              COALESCE(ua.balance, uta.balance) as current_balance,
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
    if (operation.account_type === 'banking') {
      const newBalance = parseFloat(operation.current_balance) + depositAmount;
      await pool.query(
        'UPDATE user_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newBalance.toFixed(2), operation.account_id]
      );
    } else if (operation.account_type === 'trading') {
      // Для торговых счетов добавляем к deposit_amount и balance
      const currentDepositAmount = await pool.query(
        'SELECT deposit_amount, balance FROM user_trading_accounts WHERE id = $1',
        [operation.account_id]
      );
      const newDepositAmount = parseFloat(currentDepositAmount.rows[0].deposit_amount) + depositAmount;
      const newBalance = parseFloat(currentDepositAmount.rows[0].balance) + depositAmount;
      
      await pool.query(
        'UPDATE user_trading_accounts SET deposit_amount = $1, balance = $2, updated_at = NOW() WHERE id = $3',
        [newDepositAmount.toFixed(2), newBalance.toFixed(2), operation.account_id]
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
             COALESCE(ua.number, uta.account_number) as account_number,
             u.first_name, u.last_name, u.email,
             CASE 
               WHEN uta.id IS NOT NULL THEN 'trading'
               WHEN ua.id IS NOT NULL THEN 'banking'
               ELSE 'unknown'
             END as account_type
      FROM operations o
      LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
      LEFT JOIN user_accounts ua ON o.account_id = ua.id
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
        COALESCE(SUM(balance), 0) as trading_balance
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
             u.phone, u.is_active, u.is_verified, u.created_at, u.role,
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

    query += ` GROUP BY u.id, u.email, u.first_name, u.last_name, u.middle_name, u.phone, u.is_active, u.is_verified, u.created_at, u.role ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
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
      SELECT uta.id, uta.account_number, uta.balance, uta.currency, uta.status as is_active, 
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
    const oldBalance = account.balance;

    // Обновляем баланс (balance для торговых счетов)
    const result = await pool.query(
      'UPDATE user_trading_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
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
    is_verified,
    role
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
           role = COALESCE($8, role),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [email, first_name, last_name, middle_name, phone, is_active, is_verified, role, userId]
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
    deposit_amount,
    balance,
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

    if (deposit_amount !== undefined && (isNaN(parseFloat(deposit_amount)) || parseFloat(deposit_amount) < 0)) {
      return res.status(400).json({ message: 'Invalid deposit amount. Must be a non-negative number' });
    }

    if (balance !== undefined && (isNaN(parseFloat(balance)) || parseFloat(balance) < 0)) {
      return res.status(400).json({ message: 'Invalid balance. Must be a non-negative number' });
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
           deposit_amount = COALESCE($3, deposit_amount),
           balance = COALESCE($4, balance),
           percentage = COALESCE($5, percentage),
           currency = COALESCE($6, currency),
           status = COALESCE($7, status),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [account_number, profit, deposit_amount, balance, percentage, currency, status, accountId]
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
  const { amount, currency, comment, recipient_details, status, admin_comment, contact_method, created_at } = req.body;

  try {
    // Валидация данных
    if (amount !== undefined && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)) {
      return res.status(400).json({ message: 'Invalid amount. Must be a positive number.' });
    }
    if (currency && !['RUB', 'USD', 'EUR'].includes(currency)) {
      return res.status(400).json({ message: 'Invalid currency. Must be RUB, USD, or EUR.' });
    }
    if (status && !['created', 'processing', 'completed', 'cancelled', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be created, processing, completed, cancelled, or rejected.' });
    }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (amount !== undefined) {
      updateFields.push(`amount = $${paramCount++}`);
      updateValues.push(parseFloat(amount));
    }
    if (currency !== undefined) {
      updateFields.push(`currency = $${paramCount++}`);
      updateValues.push(currency);
    }
    if (comment !== undefined) {
      updateFields.push(`comment = $${paramCount++}`);
      updateValues.push(comment);
    }
    if (recipient_details !== undefined) {
      updateFields.push(`recipient_details = $${paramCount++}`);
      updateValues.push(JSON.stringify(recipient_details));
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramCount++}`);
      updateValues.push(status);
    }
    if (admin_comment !== undefined) {
      updateFields.push(`admin_comment = $${paramCount++}`);
      updateValues.push(admin_comment);
    }
    if (contact_method !== undefined) {
      updateFields.push(`contact_method = $${paramCount++}`);
      updateValues.push(contact_method);
    }
    if (created_at !== undefined) {
      updateFields.push(`created_at = $${paramCount++}::timestamptz`);
      updateValues.push(created_at);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(operationId); // Добавляем operationId как последний параметр для WHERE

    const query = `
      UPDATE operations 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    res.json({
      message: 'Operation updated successfully',
      operation: result.rows[0]
    });

  } catch (error) {
    console.error('Update operation error:', error);
    res.status(500).json({ message: 'Failed to update operation' });
  }
};
// Обновление роли пользователя
const updateUserRole = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  try {
    // Валидация роли
    if (!role || !['user', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be user, admin, or moderator.' 
      });
    }

    // Проверяем, что пользователь существует
    const userResult = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = userResult.rows[0];

    // Проверяем, что не пытаемся изменить роль самого себя
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ 
        message: 'You cannot change your own role.' 
      });
    }

    // Обновляем роль
    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, first_name, last_name, email, role',
      [role, userId]
    );

    res.json({
      message: `User role updated to ${role} successfully`,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
};

// Получение счетов пользователя для создания операции
const getUserAccounts = async (req, res) => {
  const { userId } = req.params;

  try {
    // Проверяем, существует ли пользователь
    const userResult = await pool.query('SELECT id, first_name, last_name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Получаем только торговые счета пользователя
    const tradingAccountsResult = await pool.query(
      `SELECT id, account_number, currency, 
              COALESCE(balance, 0) as totalBalance,
              deposit_amount, profit, balance, status, 'trading' as type
       FROM user_trading_accounts 
       WHERE userId = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      user: userResult.rows[0],
      accounts: tradingAccountsResult.rows
    });

  } catch (error) {
    console.error('Get user accounts error:', error);
    res.status(500).json({ message: 'Failed to get user accounts' });
  }
};

// Удаление операции
const deleteOperation = async (req, res) => {
  const { operationId } = req.params;

  try {
    // Получаем информацию об операции
    const operationResult = await pool.query(
      `SELECT o.id, o.operation_type, o.amount, o.currency, o.status, o.user_id, o.account_id,
              CASE 
                WHEN ua.id IS NOT NULL THEN 'banking'
                WHEN uta.id IS NOT NULL THEN 'trading'
                ELSE 'unknown'
              END as account_type,
              u.first_name, u.last_name, u.email
       FROM operations o
       LEFT JOIN user_accounts ua ON o.account_id = ua.id
       LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [operationId]
    );

    if (operationResult.rows.length === 0) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    const operation = operationResult.rows[0];

    // Проверяем, можно ли удалить операцию (теперь можно удалять все операции)
    // Удаление завершенных операций требует особой осторожности

    // Начинаем транзакцию
    await pool.query('BEGIN');

    try {


      // Удаляем запись из истории операций
      await pool.query('DELETE FROM operation_history WHERE operation_id = $1', [operationId]);

      // Удаляем саму операцию
      await pool.query('DELETE FROM operations WHERE id = $1', [operationId]);

      await pool.query('COMMIT');

      res.json({
        message: 'Operation deleted successfully',
        operation: {
          id: operation.id,
          type: operation.operation_type,
          amount: operation.amount,
          currency: operation.currency,
          status: operation.status,
          user: {
            name: `${operation.first_name} ${operation.last_name}`,
            email: operation.email
          }
        }
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Delete operation error:', error);
    res.status(500).json({ message: 'Failed to delete operation' });
  }
};

// Создание пользователя администратором
const createUser = async (req, res) => {
  const { email, phone, password, firstName, lastName, middleName } = req.body;

  try {
    // Валидация обязательных полей
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required' 
      });
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Валидация пароля
    if (password.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Проверяем, существует ли пользователь с таким email
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        message: 'User with this email already exists' 
      });
    }

    // Хешируем пароль
    const bcrypt = require('bcryptjs');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Создаем пользователя
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, phone, auth_method, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email, first_name, last_name, middle_name, phone, is_active, is_verified, created_at`,
      [email, passwordHash, firstName || '', lastName || '', middleName || null, phone || null, 'password', true, false]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        middleName: user.middle_name,
        phone: user.phone,
        isActive: user.is_active,
        isVerified: user.is_verified,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
};

// Получение списка пользователей для выпадающего списка
const getUsersList = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, middle_name, email 
       FROM users 
       WHERE is_active = true 
       ORDER BY first_name, last_name`,
      []
    );

    const users = result.rows.map(user => ({
      id: user.id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      fullName: `${user.first_name} ${user.last_name} ${user.middle_name || ''}`.trim()
    }));

    res.json({
      users
    });

  } catch (error) {
    console.error('Get users list error:', error);
    res.status(500).json({ message: 'Failed to get users list' });
  }
};

// Смена пароля пользователя администратором
const changeUserPassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  try {
    // Валидация пароля
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Проверяем, существует ли пользователь
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Хешируем новый пароль
    const bcrypt = require('bcryptjs');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Обновляем пароль
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );

    const user = userResult.rows[0];

    res.json({
      message: 'Password changed successfully',
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      }
    });

  } catch (error) {
    console.error('Change user password error:', error);
    res.status(500).json({ message: 'Failed to change user password' });
  }
};

// Удаление пользователя
const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    // Проверяем, существует ли пользователь
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Начинаем транзакцию
    await pool.query('BEGIN');

    try {
      // Удаляем все связанные данные пользователя
      // 1. Удаляем операции пользователя
      await pool.query('DELETE FROM operations WHERE user_id = $1', [userId]);
      
      // 2. Удаляем банковские счета пользователя
      await pool.query('DELETE FROM user_accounts WHERE user_id = $1', [userId]);
      
      // 3. Удаляем торговые счета пользователя (если есть таблица)
      await pool.query('DELETE FROM user_trading_accounts WHERE userid = $1', [userId]);
      
      // 4. Удаляем паспортные данные пользователя
      await pool.query('DELETE FROM user_passports WHERE user_id = $1', [userId]);
      
      // 5. Удаляем документы пользователя
      await pool.query('DELETE FROM user_documents WHERE user_id = $1', [userId]);
      
      // 6. Удаляем токены восстановления пароля
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
      
      // 7. Удаляем сессии пользователя
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      
      // 8. Удаляем историю операций (если есть связанные операции)
      await pool.query(
        'DELETE FROM operation_history WHERE operation_id IN (SELECT id FROM operations WHERE user_id = $1)',
        [userId]
      );
      
      // 9. Удаляем самого пользователя
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      await pool.query('COMMIT');

      res.json({
        message: 'User and all related data deleted successfully',
        deletedUser: {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`
        }
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

module.exports = {
  processDeposit,
  getAllOperations,
  updateOperationStatus,
  updateOperation,
  getAdminStats,
  getAllUsers,
  createUser,
  getUsersList,
  changeUserPassword,
  deleteUser,
  toggleUserStatus,
  getAllAccounts,
  toggleAccountStatus,
  updateAccountBalance,
  updateAccountPercentage,
  getUserDetails,
  updateUser,
  updateBankAccount,
  updateTradingAccount,
  updateUserPassport,
  updateUserRole,
  getUserAccounts,
  deleteOperation
};
