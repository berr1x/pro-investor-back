const pool = require('../config/database');

// Генерация номера торгового счета
const generateTradingAccountNumber = () => {
    const prefix = 'TR';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
};

// Создание торгового счета
const createTradingAccount = async (req, res) => {
    try {
        const { currency = 'USD' } = req.body;
        const userId = req.user.id;

        // Проверяем, есть ли уже активный торговый счет с такой валютой
        const existingAccount = await pool.query(
            'SELECT * FROM user_trading_accounts WHERE userId = $1 AND currency = $2 AND status = $3',
            [userId, currency, 'active']
        );

        if (existingAccount.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `У вас уже есть активный торговый счет в валюте ${currency}`
            });
        }

        // Генерируем уникальный номер счета
        let accountNumber;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            accountNumber = generateTradingAccountNumber();
            const existing = await pool.query(
                'SELECT id FROM user_trading_accounts WHERE account_number = $1',
                [accountNumber]
            );
            if (existing.rows.length === 0) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            return res.status(500).json({
                success: false,
                message: 'Не удалось сгенерировать уникальный номер счета'
            });
        }

        // Создаем торговый счет
        const result = await pool.query(
            'INSERT INTO user_trading_accounts (userId, account_number, currency, profit, percentage) VALUES ($1, $2, $3, 0.00, 0.00) RETURNING *',
            [userId, accountNumber, currency]
        );

        res.json({
            success: true,
            message: 'Торговый счет успешно создан',
            account: result.rows[0]
        });

    } catch (error) {
        console.error('Ошибка создания торгового счета:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

// Получение торговых счетов пользователя
const getTradingAccounts = async (req, res) => {
    try {
        const userId = req.user.id;

        // Получаем торговые счета
        const accounts = await pool.query(
            'SELECT * FROM user_trading_accounts WHERE userId = $1 ORDER BY created_at DESC',
            [userId]
        );

        // Для каждого счета получаем сумму депозитов
        const accountsWithDeposits = await Promise.all(
            accounts.rows.map(async (account) => {
                // Ищем депозиты для этого торгового счета
                const deposits = await pool.query(
                    `SELECT amount, currency 
                     FROM operations 
                     WHERE user_id = $1 
                     AND operation_type = 'deposit' 
                     AND recipient_details->>'accountNumber' = $2`,
                    [userId, account.account_number]
                );

                // Суммируем депозиты по валютам
                const depositAmount = deposits.rows.reduce((sum, deposit) => {
                    // Если валюта депозита совпадает с валютой счета, добавляем к сумме
                    if (deposit.currency === account.currency) {
                        return sum + parseFloat(deposit.amount || 0);
                    }
                    return sum;
                }, 0);

                return {
                    ...account,
                    deposit_amount: depositAmount
                };
            })
        );

        res.json({
            success: true,
            accounts: accountsWithDeposits
        });

    } catch (error) {
        console.error('Ошибка получения торговых счетов:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

// Получение конкретного торгового счета
const getTradingAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const account = await pool.query(
            'SELECT * FROM user_trading_accounts WHERE id = $1 AND userId = $2',
            [id, userId]
        );

        if (account.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Торговый счет не найден'
            });
        }

        res.json({
            success: true,
            account: account.rows[0]
        });

    } catch (error) {
        console.error('Ошибка получения торгового счета:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

// Обновление прибыли торгового счета (только для админов)
const updateTradingAccountProfit = async (req, res) => {
    try {
        const { id } = req.params;
        const { profit, percentage } = req.body;

        // Проверяем, что пользователь - админ (временная проверка по email)
        const adminEmails = ['admin@proinvestor.com', 'test@example.com']; // Список админских email
        if (!adminEmails.includes(req.user.email)) {
            return res.status(403).json({
                success: false,
                message: 'Недостаточно прав доступа'
            });
        }

        const result = await pool.query(
            'UPDATE user_trading_accounts SET profit = $1, percentage = $2 WHERE id = $3',
            [profit, percentage, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Торговый счет не найден'
            });
        }

        // Получаем обновленный счет
        const updatedAccount = await pool.query(
            'SELECT * FROM user_trading_accounts WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: 'Торговый счет успешно обновлен',
            account: updatedAccount.rows[0]
        });

    } catch (error) {
        console.error('Ошибка обновления торгового счета:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

// Закрытие торгового счета
const closeTradingAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await pool.query(
            'UPDATE user_trading_accounts SET status = $1 WHERE id = $2 AND userId = $3',
            ['closed', id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Торговый счет не найден'
            });
        }

        res.json({
            success: true,
            message: 'Торговый счет успешно закрыт'
        });

    } catch (error) {
        console.error('Ошибка закрытия торгового счета:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

module.exports = {
    createTradingAccount,
    getTradingAccounts,
    getTradingAccount,
    updateTradingAccountProfit,
    closeTradingAccount
};