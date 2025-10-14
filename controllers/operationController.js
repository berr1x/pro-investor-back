const pool = require('../config/database');
const emailService = require('../utils/emailService');

// Создание заявки на пополнение
const createDeposit = async (req, res) => {
  const userId = req.user.id;
  const { amount, currency, comment, recipientDetails, tradingAccountId } = req.body;

  console.log('Create deposit request:', { userId, tradingAccountId, amount, currency });

  try {
    let accountId;
    let accountType = 'banking';

    // Если указан tradingAccountId, работаем с торговым счетом
    if (tradingAccountId) {
      console.log('Looking for trading account:', { tradingAccountId, userId });
      
      const tradingAccountResult = await pool.query(
        'SELECT id, deposit_amount FROM user_trading_accounts WHERE id = $1 AND userId = $2 AND status = $3',
        [tradingAccountId, userId, 'active']
      );

      console.log('Trading account query result:', tradingAccountResult.rows);

      if (tradingAccountResult.rows.length === 0) {
        // Давайте проверим, какие торговые счета есть у пользователя
        const allUserTradingAccounts = await pool.query(
          'SELECT id, account_number, status FROM user_trading_accounts WHERE userId = $1',
          [userId]
        );
        console.log('All user trading accounts:', allUserTradingAccounts.rows);
        
        return res.status(400).json({ 
          message: 'Trading account not found or inactive',
          availableAccounts: allUserTradingAccounts.rows
        });
      }

      accountId = tradingAccountResult.rows[0].id;
      accountType = 'trading';
    } else {
      // Получаем основной банковский счет пользователя
      const accountResult = await pool.query(
        'SELECT id FROM user_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1',
        [userId]
      );

      if (accountResult.rows.length === 0) {
        return res.status(400).json({ message: 'No active account found' });
      }

      accountId = accountResult.rows[0].id;
    }

    // Создаем операцию
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
      'SELECT id, account_number, currency, status, profit, deposit_amount FROM user_trading_accounts WHERE userId = $1 AND account_number = $2 AND status = $3',
      [userId, recipientDetails.accountNumber, 'active']
    );

    if (tradingAccountResult.rows.length === 0) {
      return res.status(400).json({ message: 'Trading account not found or inactive' });
    }

    const tradingAccount = tradingAccountResult.rows[0];
    const currentProfit = parseFloat(tradingAccount.profit || 0);
    const currentDeposit = parseFloat(tradingAccount.deposit_amount || 0);
    const totalBalance = currentDeposit + currentProfit;

    // Проверяем достаточность средств на торговом счете (проверяем полный баланс)
    if (totalBalance < parseFloat(amount)) {
      return res.status(400).json({ 
        message: 'Insufficient funds', 
        currentBalance: totalBalance,
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

      // Отнимаем сумму вывода из полного баланса торгового счета
      const withdrawalAmount = parseFloat(amount);
      let newProfit = currentProfit;
      let newDeposit = currentDeposit;
      
      // Сначала списываем из profit, если его недостаточно - списываем из deposit
      if (withdrawalAmount <= currentProfit) {
        newProfit = currentProfit - withdrawalAmount;
      } else {
        // Списываем весь profit и остаток из deposit
        const remainingAmount = withdrawalAmount - currentProfit;
        newProfit = 0;
        newDeposit = currentDeposit - remainingAmount;
      }
      
      await client.query(
        'UPDATE user_trading_accounts SET profit = $1, deposit_amount = $2, updated_at = NOW() WHERE id = $3',
        [newProfit.toFixed(2), newDeposit.toFixed(2), tradingAccount.id]
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
        remainingBalance: (newDeposit + newProfit).toFixed(2)
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
             COALESCE(ua.number, uta.account_number) as account_number,
             CASE 
               WHEN uta.id IS NOT NULL THEN 'trading'
               WHEN ua.id IS NOT NULL THEN 'banking'
               ELSE 'unknown'
             END as account_type
      FROM operations o
      LEFT JOIN user_trading_accounts uta ON o.account_id = uta.id
      LEFT JOIN user_accounts ua ON o.account_id = ua.id
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

// Создание операции от имени пользователя (для админки)
const createUserOperation = async (req, res) => {
  const { userId, operationType, accountId, amount, currency, comment, recipientDetails, status } = req.body;

  try {
    // Валидация данных
    if (!userId || !operationType || !accountId || !amount) {
      return res.status(400).json({ message: 'Missing required fields: userId, operationType, accountId, amount' });
    }

    if (!['deposit', 'withdrawal'].includes(operationType)) {
      return res.status(400).json({ message: 'Invalid operation type. Must be deposit or withdrawal' });
    }

    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ message: 'Invalid amount. Must be a positive number' });
    }

    const validStatuses = ['created', 'processing', 'completed', 'rejected'];
    const operationStatus = status || 'created';
    if (!validStatuses.includes(operationStatus)) {
      return res.status(400).json({ message: 'Invalid status. Must be created, processing, completed, or rejected' });
    }

    // Проверяем, существует ли пользователь
    const userResult = await pool.query('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Проверяем, существует ли счет и принадлежит ли он пользователю
    let accountResult;
    let accountType;
    
    // Сначала проверяем торговые счета
    accountResult = await pool.query(
      'SELECT id, account_number, currency, status, profit, deposit_amount FROM user_trading_accounts WHERE id = $1 AND userId = $2',
      [accountId, userId]
    );
    
    if (accountResult.rows.length > 0) {
      accountType = 'trading';
    } else {
      // Проверяем банковские счета
      accountResult = await pool.query(
        'SELECT id, number as account_number, currency, is_active as status, balance FROM user_accounts WHERE id = $1 AND user_id = $2',
        [accountId, userId]
      );
      
      if (accountResult.rows.length > 0) {
        accountType = 'banking';
      } else {
        return res.status(404).json({ message: 'Account not found or does not belong to user' });
      }
    }

    const account = accountResult.rows[0];

    // Для операций вывода проверяем достаточность средств
    if (operationType === 'withdrawal') {
      let currentBalance;
      if (accountType === 'trading') {
        currentBalance = parseFloat(account.deposit_amount || 0) + parseFloat(account.profit || 0);
      } else {
        currentBalance = parseFloat(account.balance || 0);
      }

      if (currentBalance < parseFloat(amount)) {
        return res.status(400).json({ 
          message: 'Insufficient funds', 
          currentBalance: currentBalance,
          requestedAmount: parseFloat(amount) 
        });
      }
    }

    // Начинаем транзакцию
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Создаем операцию
      const operationResult = await client.query(
        `INSERT INTO operations (user_id, account_id, operation_type, amount, currency, comment, recipient_details, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [userId, accountId, operationType, parseFloat(amount), currency || account.currency, comment || `Operation created by admin`, JSON.stringify(recipientDetails || {}), operationStatus]
      );

      const operation = operationResult.rows[0];

      // Если операция завершена, обновляем баланс счета
      if (operationStatus === 'completed') {
        if (operationType === 'deposit') {
          if (accountType === 'trading') {
            // Для торговых счетов добавляем к deposit_amount
            const newDepositAmount = parseFloat(account.deposit_amount || 0) + parseFloat(amount);
            await client.query(
              'UPDATE user_trading_accounts SET deposit_amount = $1, updated_at = NOW() WHERE id = $2',
              [newDepositAmount.toFixed(2), accountId]
            );
          } else {
            // Для банковских счетов добавляем к balance
            const newBalance = parseFloat(account.balance || 0) + parseFloat(amount);
            await client.query(
              'UPDATE user_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
              [newBalance.toFixed(2), accountId]
            );
          }
        } else if (operationType === 'withdrawal') {
          if (accountType === 'trading') {
            // Для торговых счетов списываем из полного баланса
            const withdrawalAmount = parseFloat(amount);
            const currentProfit = parseFloat(account.profit || 0);
            const currentDeposit = parseFloat(account.deposit_amount || 0);
            
            let newProfit = currentProfit;
            let newDeposit = currentDeposit;
            
            if (withdrawalAmount <= currentProfit) {
              newProfit = currentProfit - withdrawalAmount;
            } else {
              const remainingAmount = withdrawalAmount - currentProfit;
              newProfit = 0;
              newDeposit = currentDeposit - remainingAmount;
            }
            
            await client.query(
              'UPDATE user_trading_accounts SET profit = $1, deposit_amount = $2, updated_at = NOW() WHERE id = $3',
              [newProfit.toFixed(2), newDeposit.toFixed(2), accountId]
            );
          } else {
            // Для банковских счетов списываем из balance
            const newBalance = parseFloat(account.balance || 0) - parseFloat(amount);
            await client.query(
              'UPDATE user_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
              [newBalance.toFixed(2), accountId]
            );
          }
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Operation created successfully',
        operation: {
          id: operation.id,
          type: operation.operation_type,
          amount: operation.amount,
          currency: operation.currency,
          status: operation.status,
          comment: operation.comment,
          recipientDetails: operation.recipient_details,
          createdAt: operation.created_at,
          user: {
            id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            email: user.email
          },
          account: {
            id: account.id,
            number: account.account_number,
            type: accountType
          }
        }
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Create user operation error:', error);
    res.status(500).json({ message: 'Failed to create operation' });
  }
};

module.exports = {
  createDeposit,
  createWithdrawal,
  getOperations,
  getOperation,
  createUserOperation
};