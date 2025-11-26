const pool = require('../config/database');

// Получение всех доходов (для администратора)
const getAllProfits = async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT p.id, p."userId", p.account_number, p.from_date, p.to_date, p.amount, p.percentage,
             u.first_name, u.last_name, u.email
      FROM profit p
      JOIN users u ON p."userId" = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount} OR p.account_number ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY p.id DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Получаем общее количество доходов для пагинации
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM profit p
      JOIN users u ON p."userId" = u.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (u.first_name ILIKE $${countParamCount} OR u.last_name ILIKE $${countParamCount} OR u.email ILIKE $${countParamCount} OR p.account_number ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      profits: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get all profits error:', error);
    res.status(500).json({ message: 'Failed to get profits' });
  }
};

// Создание дохода
const createProfit = async (req, res) => {
  const { userId, account_number, from_date, to_date, amount, percentage } = req.body;

  try {
    // Валидация обязательных полей
    if (!userId || !account_number || !from_date || !to_date || amount === undefined || percentage === undefined) {
      return res.status(400).json({ 
        message: 'All fields are required: userId, account_number, from_date, to_date, amount, percentage' 
      });
    }

    // Валидация данных
    if (isNaN(parseInt(userId)) || parseInt(userId) <= 0) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (isNaN(parseFloat(amount)) || parseFloat(amount) < 0) {
      return res.status(400).json({ message: 'Invalid amount. Must be a non-negative number' });
    }

    if (isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0 || parseFloat(percentage) > 100) {
      return res.status(400).json({ message: 'Invalid percentage. Must be between 0 and 100' });
    }

    // Проверяем, существует ли пользователь
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем, существует ли торговый счет
    const accountResult = await pool.query(
      'SELECT id, account_number FROM user_trading_accounts WHERE userId = $1 AND account_number = $2',
      [userId, account_number]
    );
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Trading account not found for this user' });
    }

    // Проверяем корректность дат
    const fromDate = new Date(from_date);
    const toDate = new Date(to_date);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    if (fromDate > toDate) {
      return res.status(400).json({ message: 'from_date cannot be later than to_date' });
    }

    // Преобразуем даты в формат DD.MM.YYYY
    const formatDateToDDMMYYYY = (dateString) => {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    };

    const formattedFromDate = formatDateToDDMMYYYY(from_date);
    const formattedToDate = formatDateToDDMMYYYY(to_date);

    // Создаем доход
    const result = await pool.query(
      `INSERT INTO profit ("userId", account_number, from_date, to_date, amount, percentage)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, account_number, formattedFromDate, formattedToDate, parseFloat(amount), parseFloat(percentage)]
    );

    res.status(201).json({
      message: 'Profit created successfully',
      profit: result.rows[0]
    });

  } catch (error) {
    console.error('Create profit error:', error);
    res.status(500).json({ message: 'Failed to create profit' });
  }
};

// Обновление дохода
const updateProfit = async (req, res) => {
  const { profitId } = req.params;
  const { userId, account_number, from_date, to_date, amount, percentage } = req.body;

  try {
    // Проверяем, существует ли доход
    const profitResult = await pool.query('SELECT id FROM profit WHERE id = $1', [profitId]);
    if (profitResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profit not found' });
    }

    // Валидация данных
    if (userId !== undefined && (isNaN(parseInt(userId)) || parseInt(userId) <= 0)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (amount !== undefined && (isNaN(parseFloat(amount)) || parseFloat(amount) < 0)) {
      return res.status(400).json({ message: 'Invalid amount. Must be a non-negative number' });
    }

    if (percentage !== undefined && (isNaN(parseFloat(percentage)) || parseFloat(percentage) < 0 || parseFloat(percentage) > 100)) {
      return res.status(400).json({ message: 'Invalid percentage. Must be between 0 and 100' });
    }

    // Если указан userId, проверяем его существование
    if (userId !== undefined) {
      const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
    }

    // Если указан account_number и userId, проверяем существование торгового счета
    if (account_number !== undefined && userId !== undefined) {
      const accountResult = await pool.query(
        'SELECT id, account_number FROM user_trading_accounts WHERE userId = $1 AND account_number = $2',
        [userId, account_number]
      );
      if (accountResult.rows.length === 0) {
        return res.status(404).json({ message: 'Trading account not found for this user' });
      }
    }

    // Проверяем корректность дат, если они указаны
    let formattedFromDate = from_date;
    let formattedToDate = to_date;

    if (from_date !== undefined || to_date !== undefined) {
      const fromDate = from_date ? new Date(from_date) : null;
      const toDate = to_date ? new Date(to_date) : null;

      if (from_date && isNaN(fromDate.getTime())) {
        return res.status(400).json({ message: 'Invalid from_date format' });
      }

      if (to_date && isNaN(toDate.getTime())) {
        return res.status(400).json({ message: 'Invalid to_date format' });
      }

      if (fromDate && toDate && fromDate > toDate) {
        return res.status(400).json({ message: 'from_date cannot be later than to_date' });
      }

      // Преобразуем даты в формат DD.MM.YYYY, если они указаны
      const formatDateToDDMMYYYY = (dateString) => {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
      };

      if (from_date) {
        formattedFromDate = formatDateToDDMMYYYY(from_date);
      }

      if (to_date) {
        formattedToDate = formatDateToDDMMYYYY(to_date);
      }
    }

    // Формируем запрос на обновление
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    if (userId !== undefined) {
      paramCount++;
      updateFields.push(`"userId" = $${paramCount}`);
      updateValues.push(userId);
    }

    if (account_number !== undefined) {
      paramCount++;
      updateFields.push(`account_number = $${paramCount}`);
      updateValues.push(account_number);
    }

    if (from_date !== undefined) {
      paramCount++;
      updateFields.push(`from_date = $${paramCount}`);
      updateValues.push(formattedFromDate);
    }

    if (to_date !== undefined) {
      paramCount++;
      updateFields.push(`to_date = $${paramCount}`);
      updateValues.push(formattedToDate);
    }

    if (amount !== undefined) {
      paramCount++;
      updateFields.push(`amount = $${paramCount}`);
      updateValues.push(parseFloat(amount));
    }

    if (percentage !== undefined) {
      paramCount++;
      updateFields.push(`percentage = $${paramCount}`);
      updateValues.push(parseFloat(percentage));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    paramCount++;
    updateValues.push(profitId);

    const query = `
      UPDATE profit 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, updateValues);

    res.json({
      message: 'Profit updated successfully',
      profit: result.rows[0]
    });

  } catch (error) {
    console.error('Update profit error:', error);
    res.status(500).json({ message: 'Failed to update profit' });
  }
};

// Удаление дохода
const deleteProfit = async (req, res) => {
  const { profitId } = req.params;

  try {
    // Проверяем, существует ли доход
    const profitResult = await pool.query('SELECT id FROM profit WHERE id = $1', [profitId]);
    if (profitResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profit not found' });
    }

    // Удаляем доход
    await pool.query('DELETE FROM profit WHERE id = $1', [profitId]);

    res.json({
      message: 'Profit deleted successfully',
      profitId: parseInt(profitId)
    });

  } catch (error) {
    console.error('Delete profit error:', error);
    res.status(500).json({ message: 'Failed to delete profit' });
  }
};

// Получение доходов пользователя
const getUserProfits = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT p.id, p."userId", p.account_number, p.from_date, p.to_date, p.amount, p.percentage
       FROM profit p
       WHERE p."userId" = $1
       ORDER BY p.id DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      profits: result.rows
    });

  } catch (error) {
    console.error('Get user profits error:', error);
    res.status(500).json({ message: 'Failed to get user profits' });
  }
};

module.exports = {
  getAllProfits,
  createProfit,
  updateProfit,
  deleteProfit,
  getUserProfits
};

