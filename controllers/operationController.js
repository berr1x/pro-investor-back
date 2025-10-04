const pool = require('../config/database');
const emailService = require('../utils/emailService');

// Создание заявки на пополнение
const createDeposit = async (req, res) => {
  const userId = req.user.id;
  const { amount, currency, comment, recipientDetails } = req.body;

  try {
    // Получаем основной счет пользователя
    const accountResult = await pool.query(
      'SELECT id FROM user_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1',
      [userId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(400).json({ message: 'No active account found' });
    }

    const accountId = accountResult.rows[0].id;

    // Создаем операцию с новыми полями
    const operationResult = await pool.query(
      `INSERT INTO operations (user_id, account_id, operation_type, amount, currency, comment, recipient_details, status)
       VALUES ($1, $2, 'deposit', $3, $4, $5, $6, 'created')
       RETURNING *`,
      [userId, accountId, amount, currency, comment, JSON.stringify(recipientDetails)]
    );

    const operation = operationResult.rows[0];

    // Получаем данные пользователя для уведомления
    const userResult = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    const userName = `${user.first_name} ${user.last_name}`;

    // Отправляем уведомление администратору
    // try {
    //   await emailService.sendAdminNotification(
    //     'deposit',
    //     amount,
    //     user.email,
    //     userName,
    //     {
    //       comment,
    //       currency,
    //       recipientDetails,
    //       operationId: operation.id
    //     }
    //   );
    // } catch (emailError) {
    //   console.error('Failed to send admin notification:', emailError);
    // }

    // Отправляем уведомление пользователю
    // try {
    //   await emailService.sendOperationNotification(
    //     user.email,
    //     user.first_name,
    //     'deposit',
    //     amount,
    //     'created'
    //   );
    // } catch (emailError) {
    //   console.error('Failed to send user notification:', emailError);
    // }

    res.status(201).json({
      message: 'Deposit request created successfully',
      operation: {
        id: operation.id,
        type: operation.operation_type,
        amount: operation.amount,
        currency: operation.currency,
        status: operation.status,
        comment: operation.comment,
        recipientDetails: operation.recipient_details,
        createdAt: operation.created_at
      }
    });

  } catch (error) {
    console.error('Create deposit error:', error);
    res.status(500).json({ message: 'Failed to create deposit request' });
  }
};

// Создание заявки на вывод средств
const createWithdrawal = async (req, res) => {
  const userId = req.user.id;
  const { amount, recipientDetails, comment } = req.body;

  try {
    // Проверяем, что передан номер счета для списания
    if (!recipientDetails || !recipientDetails.accountNumber) {
      return res.status(400).json({ message: 'Account number is required for withdrawal' });
    }

    // Получаем торговый счет пользователя по номеру
    const tradingAccountResult = await pool.query(
      'SELECT id, account_number, currency, status, profit FROM user_trading_accounts WHERE userId = $1 AND account_number = $2 AND status = $3',
      [userId, recipientDetails.accountNumber, 'active']
    );

    if (tradingAccountResult.rows.length === 0) {
      return res.status(400).json({ message: 'Trading account not found or inactive' });
    }

    const tradingAccount = tradingAccountResult.rows[0];
    const currentProfit = parseFloat(tradingAccount.profit || 0);

    // Проверяем достаточность средств на торговом счете (проверяем profit)
    if (currentProfit < parseFloat(amount)) {
      return res.status(400).json({ 
        message: 'Insufficient funds', 
        currentBalance: currentProfit,
        requestedAmount: amount 
      });
    }

    // Начинаем транзакцию для атомарности операций
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Создаем операцию вывода
      const operationResult = await client.query(
        `INSERT INTO operations (user_id, account_id, operation_type, amount, comment, recipient_details, status, currency)
         VALUES ($1, $2, 'withdrawal', $3, $4, $5, 'created', $6)
         RETURNING *`,
        [userId, tradingAccount.id, amount, comment, JSON.stringify(recipientDetails), tradingAccount.currency]
      );

      const operation = operationResult.rows[0];

      // Отнимаем сумму вывода из profit торгового счета
      const newProfit = currentProfit - parseFloat(amount);
      await client.query(
        'UPDATE user_trading_accounts SET profit = $1, updated_at = NOW() WHERE id = $2',
        [newProfit.toFixed(2), tradingAccount.id]
      );

      await client.query('COMMIT');

      // Получаем данные пользователя для уведомления
      const userResult = await client.query(
        'SELECT first_name, last_name, email FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];
      const userName = `${user.first_name} ${user.last_name}`;

      // Отправляем уведомление администратору
      try {
        await emailService.sendAdminNotification(
          'withdrawal',
          amount,
          user.email,
          userName,
          {
            comment,
            recipientDetails,
            operationId: operation.id
          }
        );
      } catch (emailError) {
        console.error('Failed to send admin notification:', emailError);
      }

      // Отправляем уведомление пользователю
      try {
        await emailService.sendOperationNotification(
          user.email,
          user.first_name,
          'withdrawal',
          amount,
          'created'
        );
      } catch (emailError) {
        console.error('Failed to send user notification:', emailError);
      }

      res.status(201).json({
        message: 'Withdrawal request created successfully',
        operation: {
          id: operation.id,
          type: operation.operation_type,
          amount: operation.amount,
          status: operation.status,
          comment: operation.comment,
          recipientDetails: operation.recipient_details,
          currency: operation.currency,
          createdAt: operation.created_at
        },
        remainingBalance: newProfit.toFixed(2)
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Create withdrawal error:', error);
    res.status(500).json({ message: 'Failed to create withdrawal request' });
  }
};

// Получение истории операций
const getOperations = async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10, status, type } = req.query;
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
             CASE 
               WHEN ua.id IS NOT NULL THEN 'banking'
               WHEN uta.id IS NOT NULL THEN 'trading'
               ELSE 'unknown'
             END as account_type
      FROM operations o
      LEFT JOIN user_accounts ua ON o.account_id = ua.id
      LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
      WHERE o.user_id = $1
    `;
    
    const queryParams = [userId];
    let paramCount = 1;

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

    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Получаем общее количество операций для пагинации
    let countQuery = 'SELECT COUNT(*) as total FROM operations WHERE user_id = $1';
    const countParams = [userId];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (type) {
      countParamCount++;
      countQuery += ` AND operation_type = $${countParamCount}`;
      countParams.push(type);
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
    console.error('Get operations error:', error);
    res.status(500).json({ message: 'Failed to get operations' });
  }
};

// Получение конкретной операции
const getOperation = async (req, res) => {
  const userId = req.user.id;
  const { operationId } = req.params;

  try {
    const result = await pool.query(
      `SELECT o.id, o.operation_type, o.amount, o.currency, o.status, 
              o.comment, o.admin_comment, o.recipient_details, o.contact_method,
              o.created_at, o.updated_at,
              ua.account_number
       FROM operations o
       JOIN user_accounts ua ON o.account_id = ua.id
       WHERE o.id = $1 AND o.user_id = $2`,
      [operationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    res.json({
      operation: result.rows[0]
    });

  } catch (error) {
    console.error('Get operation error:', error);
    res.status(500).json({ message: 'Failed to get operation' });
  }
};

module.exports = {
  createDeposit,
  createWithdrawal,
  getOperations,
  getOperation
};