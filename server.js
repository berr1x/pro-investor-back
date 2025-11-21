const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://24rusinvest.ru'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting - более мягкие ограничения для разработки
if (process.env.DISABLE_RATE_LIMIT !== 'true') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 1000 запросов для разработки, 100 для продакшена
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
      // Пропускаем rate limiting для некоторых эндпоинтов в разработке
      if (process.env.NODE_ENV !== 'production') {
        const skipPaths = ['/api/profile', '/api/accounts', '/api/trading-accounts'];
        return skipPaths.some(path => req.path.startsWith(path));
      }
      return false;
    }
  });
  app.use(limiter);
  console.log(`Rate limiting enabled: ${process.env.NODE_ENV === 'production' ? '100' : '1000'} requests per 15 minutes`);
} else {
  console.log('Rate limiting disabled');
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const accountRoutes = require('./routes/accounts');
const operationRoutes = require('./routes/operations');
const adminRoutes = require('./routes/admin');
const tradingAccountRoutes = require('./routes/tradingAccounts');
const adminBankAccountRoutes = require('./routes/adminBankAccounts');
const adminTradingAccountRoutes = require('./routes/adminTradingAccounts');
const adminProfitsRoutes = require('./routes/adminProfits');

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Pro-Investor API Server', 
    version: '1.0.0',
    status: 'running'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trading-accounts', tradingAccountRoutes);
app.use('/api/admin/bank-accounts', adminBankAccountRoutes);
app.use('/api/admin/trading-accounts', adminTradingAccountRoutes);
app.use('/api/admin/profits', adminProfitsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});