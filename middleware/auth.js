const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  console.log('Auth middleware - URL:', req.url);
  console.log('Auth middleware - Authorization header:', authHeader);
  console.log('Auth middleware - Token:', token ? 'Present' : 'Missing');

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Проверяем, что пользователь существует и активен
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!userResult.rows[0].is_active) {
      return res.status(401).json({ message: 'User account is deactivated' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    return res.status(500).json({ message: 'Token verification failed' });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    // Проверяем, что пользователь является администратором
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, is_active, is_verified FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ message: 'User account is deactivated' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(500).json({ message: 'Admin verification failed' });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin
};