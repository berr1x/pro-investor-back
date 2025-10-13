const pool = require('../config/database');

// Получение профиля пользователя
const getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    // Получаем основную информацию о пользователе
    const userResult = await pool.query(
      `SELECT id, email, first_name, last_name, middle_name, phone, 
              is_active, is_verified, created_at, updated_at, auth_method, role
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Получаем паспортные данные
    const passportResult = await pool.query(
      'SELECT * FROM user_passports WHERE user_id = $1',
      [userId]
    );

    // Получаем документы
    const documentsResult = await pool.query(
      'SELECT * FROM user_documents WHERE user_id = $1 ORDER BY uploaded_at DESC',
      [userId]
    );

    // Получаем счета пользователя
    const accountsResult = await pool.query(
      'SELECT * FROM user_accounts WHERE user_id = $1',
      [userId]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        middleName: user.middle_name,
        phone: user.phone,
        isActive: user.is_active,
        isVerified: user.is_verified,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        authMethod: user.auth_method,
        role: user.role
      },
      passport: passportResult.rows[0] || null,
      documents: documentsResult.rows,
      accounts: accountsResult.rows
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile' });
  }
};

// Обновление профиля пользователя
const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { firstName, lastName, middleName, phone } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           middle_name = COALESCE($3, middle_name),
           phone = COALESCE($4, phone),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, email, first_name, last_name, middle_name, phone, updated_at`,
      [firstName, lastName, middleName, phone, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name,
        middleName: result.rows[0].middle_name,
        phone: result.rows[0].phone,
        updatedAt: result.rows[0].updated_at,
        authMethod: result.rows[0].auth_method
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// Обновление паспортных данных
const updatePassport = async (req, res) => {
  const userId = req.user.id;
  const { series, number, issued_by, issue_date, department_code, gender, birth_date } = req.body;

  console.log('Получены данные паспорта:', {
    series, number, issued_by, issue_date, department_code, gender, birth_date
  });

  console.log('Полученные даты:', {
    issue_date: issue_date,
    birth_date: birth_date
  });

  try {
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
    console.error('Update passport error:', error);
    res.status(500).json({ message: 'Failed to update passport data' });
  }
};

// Загрузка документа
const uploadDocument = async (req, res) => {
  const userId = req.user.id;
  const { documentType, fileName, filePath, fileSize, mimeType } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO user_documents 
       (user_id, document_type, file_name, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, documentType, fileName, filePath, fileSize, mimeType]
    );

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: result.rows[0]
    });

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ message: 'Failed to upload document' });
  }
};

// Получение документов пользователя
const getDocuments = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT * FROM user_documents WHERE user_id = $1 ORDER BY uploaded_at DESC',
      [userId]
    );

    res.json({
      documents: result.rows
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Failed to get documents' });
  }
};

// Удаление документа
const deleteDocument = async (req, res) => {
  const userId = req.user.id;
  const { documentId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM user_documents WHERE id = $1 AND user_id = $2 RETURNING *',
      [documentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({
      message: 'Document deleted successfully',
      document: result.rows[0]
    });

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Failed to delete document' });
  }
};

// Изменение метода авторизации
const changeAuthMethod = async (req, res) => {
  const userId = req.user.id;
  const { authMethod } = req.body; // 'sms' or 'password'
  
  try {
    const result = await pool.query(
      'UPDATE users SET auth_method = $1 WHERE id = $2 RETURNING *',
      [authMethod, userId]
    );
    
    res.json({
      message: 'Authentication method changed successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Change auth method error:', error);
    res.status(500).json({ message: 'Failed to change authentication method' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updatePassport,
  uploadDocument,
  getDocuments,
  deleteDocument,
  changeAuthMethod
};