const nodemailer = require('nodemailer');

// Создаем транспортер для отправки email
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true для 465, false для других портов
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Отправка email приветствия после регистрации
const sendWelcomeEmail = async (email, firstName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Добро пожаловать в PRO-INVESTOR!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Добро пожаловать в PRO-INVESTOR!</h2>
          <p>Здравствуйте, ${firstName}!</p>
          <p>Спасибо за регистрацию в нашем инвестиционном сервисе. Теперь вы можете:</p>
          <ul>
            <li>Пополнять свой инвестиционный счет</li>
            <li>Отслеживать доходность ваших инвестиций</li>
            <li>Выводить средства</li>
            <li>Просматривать историю операций</li>
          </ul>
          <p>Если у вас есть вопросы, обращайтесь в службу поддержки.</p>
          <p>С уважением,<br>Команда PRO-INVESTOR</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to:', email);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

// Отправка email для восстановления пароля
const sendPasswordResetEmail = async (email, firstName, resetToken) => {
  try {
    const transporter = createTransporter();
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Восстановление пароля - PRO-INVESTOR',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Восстановление пароля</h2>
          <p>Здравствуйте, ${firstName}!</p>
          <p>Вы запросили восстановление пароля для вашего аккаунта в PRO-INVESTOR.</p>
          <p>Для создания нового пароля перейдите по ссылке:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #3498db; color: white; text-decoration: none; border-radius: 5px;">Восстановить пароль</a>
          <p>Ссылка действительна в течение 1 часа.</p>
          <p>Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.</p>
          <p>С уважением,<br>Команда PRO-INVESTOR</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

// Отправка уведомления о создании заявки
const sendOperationNotification = async (email, firstName, operationType, amount, status) => {
  try {
    const transporter = createTransporter();
    
    const operationText = operationType === 'deposit' ? 'пополнения' : 'вывода';
    const statusText = {
      'created': 'создана',
      'processing': 'в обработке',
      'completed': 'исполнена',
      'rejected': 'отклонена'
    }[status] || status;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Уведомление о заявке ${operationText} - PRO-INVESTOR`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Уведомление о заявке</h2>
          <p>Здравствуйте, ${firstName}!</p>
          <p>Статус вашей заявки на ${operationText} средств изменен:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Тип операции:</strong> ${operationText}</p>
            <p><strong>Сумма:</strong> ${amount} RUB</p>
            <p><strong>Статус:</strong> ${statusText}</p>
          </div>
          <p>Вы можете отслеживать статус заявки в личном кабинете.</p>
          <p>С уважением,<br>Команда PRO-INVESTOR</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Operation notification email sent to:', email);
  } catch (error) {
    console.error('Error sending operation notification email:', error);
    throw error;
  }
};

// Отправка email администратору о новой заявке
const sendAdminNotification = async (operationType, amount, userEmail, userName, details) => {
  try {
    const transporter = createTransporter();
    
    const operationText = operationType === 'deposit' ? 'пополнения' : 'вывода';
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `Новая заявка на ${operationText} - PRO-INVESTOR`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Новая заявка на ${operationText}</h2>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Пользователь:</strong> ${userName} (${userEmail})</p>
            <p><strong>Тип операции:</strong> ${operationText}</p>
            <p><strong>Сумма:</strong> ${amount} RUB</p>
            <p><strong>Детали:</strong></p>
            <pre style="background-color: #e9ecef; padding: 10px; border-radius: 3px;">${JSON.stringify(details, null, 2)}</pre>
          </div>
          <p>Пожалуйста, обработайте заявку в административной панели.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Admin notification email sent');
  } catch (error) {
    console.error('Error sending admin notification email:', error);
    throw error;
  }
};

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOperationNotification,
  sendAdminNotification
};