const pool = require('../config/database');

// Получение всех банковских счетов с пагинацией и фильтрами
const getAllBankAccounts = async (req, res) => {
  const { page = 1, limit = 20, search, isActive, currency } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT ua.id, ua.account_number, ua.balance, ua.currency, ua.is_active, 
             ua.bank, ua.bik_or_bankname, ua.number, ua.bankname, ua.inn, ua.kpp, 
             ua.corp_bank_account, ua.created_at, ua.updated_at,
             u.first_name, u.last_name, u.email
      FROM user_accounts ua
      JOIN users u ON ua.user_id = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (ua.account_number ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    if (isActive !== undefined) {
      paramCount++;
      query += ` AND ua.is_active = $${paramCount}`;
      queryParams.push(isActive === 'true');
    }

    if (currency) {
      paramCount++;
      query += ` AND ua.currency = $${paramCount}`;
      queryParams.push(currency);
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

    if (search) {
      countParamCount++;
      countQuery += ` AND (ua.account_number ILIKE $${countParamCount} OR u.first_name ILIKE $${countParamCount} OR u.last_name ILIKE $${countParamCount} OR u.email ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (isActive !== undefined) {
      countParamCount++;
      countQuery += ` AND ua.is_active = $${countParamCount}`;
      countParams.push(isActive === 'true');
    }

    if (currency) {
      countParamCount++;
      countQuery += ` AND ua.currency = $${countParamCount}`;
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
    console.error('Get all bank accounts error:', error);
    res.status(500).json({ message: 'Failed to get bank accounts' });
  }
};

// Переключение статуса банковского счета
const toggleBankAccountStatus = async (req, res) => {
  const { accountId } = req.params;
  const { isActive } = req.body;

  try {
    const result = await pool.query(
      'UPDATE user_accounts SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, account_number, is_active',
      [isActive, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Bank account not found' });
    }

    res.json({
      message: `Bank account ${isActive ? 'activated' : 'deactivated'} successfully`,
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Toggle bank account status error:', error);
    res.status(500).json({ message: 'Failed to update bank account status' });
  }
};

// Удаление банковского счета
const deleteBankAccount = async (req, res) => {
  const { accountId } = req.params;

  if (!accountId) {
    return res.status(400).json({ message: 'Account ID is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Проверяем, существует ли счет
    const accountResult = await client.query(
      'SELECT id, account_number, user_id FROM user_accounts WHERE id = $1',
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bank account not found' });
    }

    const account = accountResult.rows[0];

    // Удаляем все операции, связанные с этим счетом
    await client.query(
      'DELETE FROM operations WHERE account_id = $1',
      [accountId]
    );

    // Удаляем сам банковский счет
    await client.query(
      'DELETE FROM user_accounts WHERE id = $1',
      [accountId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Bank account and all related operations deleted successfully',
      deletedAccount: {
        id: account.id,
        account_number: account.account_number,
        user_id: account.user_id
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete bank account error:', error);
    res.status(500).json({ message: 'Failed to delete bank account' });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllBankAccounts,
  toggleBankAccountStatus,
  deleteBankAccount
};
