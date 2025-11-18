const nodemailer = require('nodemailer');

const SMTP_USER = process.env.EMAIL_USER;
const SMTP_PASS = process.env.EMAIL_PASS;

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transporter;
}

async function sendCodeMail({ to, subject, code }) {
  const t = getTransporter();
  const html = `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#0b0e14;color:#e5e7eb;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#0f1320;border-radius:16px;padding:24px;border:1px solid #1f2937">
      <h2 style="margin:0;color:#93c5fd">Your verification code</h2>
      <p style="color:#9ca3af">Use the following code to continue. It expires in 10 minutes.</p>
      <div style="font-size:28px;letter-spacing:6px;font-weight:700;background:#111827;border:1px solid #374151;color:#f9fafb;padding:12px 16px;border-radius:12px;text-align:center">${code}</div>
      <p style="color:#6b7280;margin-top:16px">If you didn’t request this, you can ignore this email.</p>
    </div>
  </div>`;
  await t.sendMail({ from: SMTP_USER, to, subject, html });
}

module.exports = { sendCodeMail };
