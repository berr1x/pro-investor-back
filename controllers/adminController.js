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
              ua.account_number, ua.balance as current_balance,
              u.first_name, u.last_name, u.email
       FROM operations o
       JOIN user_accounts ua ON o.account_id = ua.id
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

    // Обновляем баланс пользователя
    const newBalance = parseFloat(operation.current_balance) + depositAmount;
    
    await pool.query(
      'UPDATE user_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance.toFixed(2), operation.account_id]
    );

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
             ua.account_number,
             u.first_name, u.last_name, u.email
      FROM operations o
      JOIN user_accounts ua ON o.account_id = ua.id
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
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30_days
      FROM users
    `);

    // Статистика по счетам
    const accountsStats = await pool.query(`
      SELECT 
        COUNT(*) as total_accounts,
        SUM(balance) as total_balance,
        AVG(balance) as avg_balance
      FROM user_accounts
      WHERE is_active = true
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

    res.json({
      operations: operationsStats.rows[0],
      users: usersStats.rows[0],
      accounts: accountsStats.rows[0],
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

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
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
      SELECT ua.id, ua.account_number, ua.balance, ua.currency, ua.is_active, 
             ua.bank, ua.number, ua.created_at, ua.updated_at,
             u.first_name, u.last_name, u.email
      FROM user_accounts ua
      JOIN users u ON ua.user_id = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (userId) {
      paramCount++;
      query += ` AND ua.user_id = $${paramCount}`;
      queryParams.push(userId);
    }

    if (currency) {
      paramCount++;
      query += ` AND ua.currency = $${paramCount}`;
      queryParams.push(currency);
    }

    if (isActive !== undefined) {
      paramCount++;
      query += ` AND ua.is_active = $${paramCount}`;
      queryParams.push(isActive === 'true');
    }

    query += ` ORDER BY ua.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Получаем общее количество счетов для пагинации
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM user_accounts ua
      JOIN users u ON ua.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (userId) {
      countParamCount++;
      countQuery += ` AND ua.user_id = $${countParamCount}`;
      countParams.push(userId);
    }

    if (currency) {
      countParamCount++;
      countQuery += ` AND ua.currency = $${countParamCount}`;
      countParams.push(currency);
    }

    if (isActive !== undefined) {
      countParamCount++;
      countQuery += ` AND ua.is_active = $${countParamCount}`;
      countParams.push(isActive === 'true');
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
    const result = await pool.query(
      'UPDATE user_accounts SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, account_number, is_active',
      [isActive, accountId]
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
      'SELECT * FROM user_accounts WHERE id = $1',
      [accountId]
    );

    if (currentAccount.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const account = currentAccount.rows[0];
    const oldBalance = account.balance;

    // Обновляем баланс
    const result = await pool.query(
      'UPDATE user_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
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

    // Получаем счета пользователя
    const accountsResult = await pool.query(
      'SELECT * FROM user_accounts WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Получаем операции пользователя за последние 30 дней
    const operationsResult = await pool.query(
      `SELECT o.*, ua.account_number 
       FROM operations o
       JOIN user_accounts ua ON o.account_id = ua.id
       WHERE o.user_id = $1 AND o.created_at >= NOW() - INTERVAL '30 days'
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      user,
      accounts: accountsResult.rows,
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
      'UPDATE user_accounts SET percentage = $1, updated_at = NOW() WHERE id = $2',
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

module.exports = {
  processDeposit,
  getAllOperations,
  updateOperationStatus,
  getAdminStats,
  getAllUsers,
  toggleUserStatus,
  getAllAccounts,
  toggleAccountStatus,
  updateAccountBalance,
  updateAccountPercentage,
  getUserDetails
};