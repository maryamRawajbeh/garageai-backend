const nodemailer = require('nodemailer');

let cachedTransporter;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return cachedTransporter;
}

/**
 * Sends the password reset email, or logs the link server-side when no SMTP
 * provider is configured (local dev / test).
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!isConfigured()) {
    console.log(`[GarageAI] Password reset requested for ${toEmail}: ${resetUrl}`);
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'GarageAI - إعادة تعيين كلمة المرور',
    text: `اضغط على الرابط التالي لإعادة تعيين كلمة المرور (صالح لمدة ساعة واحدة):\n${resetUrl}\n\nإذا لم تطلب هذا، تجاهل هذه الرسالة.`,
  });
}

module.exports = { sendPasswordResetEmail };
