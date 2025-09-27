const pool = require('../config/database');
const emailService = require('../utils/emailService');

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

module.exports = {
  getAllOperations,
  updateOperationStatus,
  getAdminStats,
  getAllUsers,
  toggleUserStatus
};