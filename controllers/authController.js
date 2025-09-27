const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const emailService = require('../utils/emailService');

// Генерация JWT токена
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

const getAuthMethod = async (req, res) => {
  const { value } = req.body;

  const result = await pool.query(  
    'SELECT auth_method FROM users WHERE email = $1 OR phone = $1',
    [value]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({ method: result.rows[0].auth_method });
};

// Регистрация пользователя
const register = async (req, res) => {
  const { email, password, firstName, lastName, middleName, phone } = req.body;

  try {
    // Проверяем, существует ли пользователь
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Хешируем пароль
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Создаем пользователя
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, middle_name, phone, auth_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, first_name, last_name, middle_name, phone, created_at, auth_method`,
      [email, passwordHash, firstName, lastName, middleName, phone, 'password']
    );

    const user = result.rows[0];

    // Генерируем токен
    const token = generateToken(user.id);

    // Логируем вход
    await pool.query(
      'INSERT INTO user_sessions (user_id, ip_address, user_agent) VALUES ($1, $2, $3)',
      [user.id, req.ip, req.get('User-Agent')]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        middleName: user.middle_name,
        phone: user.phone,
        authMethod: user.auth_method
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};

// Вход пользователя
const login = async (req, res) => {
  const { email, password, phone } = req.body;

  try {
    // Находим пользователя
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, middle_name, is_active, auth_method FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Генерируем токен
    const token = generateToken(user.id);

    // Логируем вход
    await pool.query(
      'INSERT INTO user_sessions (user_id, ip_address, user_agent) VALUES ($1, $2, $3)',
      [user.id, req.ip, req.get('User-Agent')]
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        middleName: user.middle_name,
        phone: user.phone,
        authMethod: user.auth_method
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

// Восстановление пароля
const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, middle_name, phone FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Не раскрываем информацию о том, существует ли пользователь
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }

    const user = result.rows[0];

    // Генерируем токен восстановления
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 3600000); // 1 час

    // Сохраняем токен в базе
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetToken, expiresAt]
    );

    // Отправляем email (в реальном проекте)
    try {
      await emailService.sendPasswordResetEmail(user.email, user.first_name, user.last_name, user.middle_name, user.phone, resetToken);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Не прерываем процесс, если email не отправился
    }

    res.json({ message: 'If the email exists, a password reset link has been sent' });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Password reset request failed' });
  }
};

// Сброс пароля по токену
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    // Находим токен
    const tokenResult = await pool.query(
      `SELECT prt.user_id, prt.expires_at, u.email, u.first_name, u.last_name, u.middle_name, u.phone
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.used = false AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const tokenData = tokenResult.rows[0];

    // Хешируем новый пароль
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Обновляем пароль
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, tokenData.user_id]
    );

    // Помечаем токен как использованный
    await pool.query(
      'UPDATE password_reset_tokens SET used = true WHERE token = $1',
      [token]
    );

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Password reset failed' });
  }
};

// Смена пароля (для авторизованных пользователей)
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // Получаем текущий пароль
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем текущий пароль
    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Хешируем новый пароль
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Обновляем пароль
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Password change failed' });
  }
};

// Выход из системы
const logout = async (req, res) => {
  const userId = req.user.id;

  try {
    // Деактивируем активные сессии пользователя
    await pool.query(
      'UPDATE user_sessions SET is_active = false, logout_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    res.json({ message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
};

module.exports = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  changePassword,
  logout,
  getAuthMethod
};