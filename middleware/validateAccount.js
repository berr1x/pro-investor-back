const validateAccountCreation = (req, res, next) => {
  const { bank, bik_or_bankname, currency, inn, kpp } = req.body;
  const errors = [];

  // Проверка обязательных полей
  if (!bank || typeof bank !== 'string' || bank.trim().length === 0) {
    errors.push('Bank is required and must be a non-empty string');
  }

  if (!bik_or_bankname || typeof bik_or_bankname !== 'string' || bik_or_bankname.trim().length === 0) {
    errors.push('BIK or bank name is required and must be a non-empty string');
  }

  // Проверка валюты (если указана)
  if (currency && typeof currency !== 'string') {
    errors.push('Currency must be a string');
  }

  // Проверка ИНН (если указан)
  if (inn) {
    if (typeof inn !== 'string') {
      errors.push('INN must be a string');
    } else if (!/^\d{10}$|^\d{12}$/.test(inn)) {
      errors.push('INN must be 10 or 12 digits');
    }
  }

  // Проверка КПП (если указан)
  if (kpp) {
    if (typeof kpp !== 'string') {
      errors.push('KPP must be a string');
    } else if (!/^\d{9}$/.test(kpp)) {
      errors.push('KPP must be exactly 9 digits');
    }
  }

  // Проверка длины строковых полей
  const stringFields = ['bank', 'bik_or_bankname', 'number', 'bankname', 'corp_bank_account'];
  stringFields.forEach(field => {
    if (req.body[field] && typeof req.body[field] === 'string' && req.body[field].length > 255) {
      errors.push(`${field} must not exceed 255 characters`);
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors
    });
  }

  next();
};

module.exports = {
  validateAccountCreation
};