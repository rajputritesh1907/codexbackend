const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const EmailCode = require('../models/emailCodeModel');
const { sendCodeMail } = require('../utils/mailer');

// Helpers
const CODE_TTL_MIN = 10; // minutes
const RATE_LIMIT_MS = 60 * 1000; // 1 min per request per purpose/email
const lastSent = new Map(); // key: `${purpose}:${email}` -> ts

function genCode() {
  // 4-6-4 grouping for readability (e.g., 123456) but we can do 6 digits
  return ('' + Math.floor(100000 + Math.random() * 900000));
}

function recentKey(purpose, email) { return `${purpose}:${email.toLowerCase()}`; }

// Request signup verification code
router.post('/signup/request-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: 'Email required' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.json({ success: false, message: 'Email already exists' });
    const key = recentKey('signup', email);
    const now = Date.now();
    if (lastSent.has(key) && now - lastSent.get(key) < RATE_LIMIT_MS) {
      return res.json({ success: false, message: 'Please wait a minute before requesting another code' });
    }
    lastSent.set(key, now);
    const code = genCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);
    await EmailCode.deleteMany({ email: email.toLowerCase(), purpose: 'signup' });
    await EmailCode.create({ purpose: 'signup', email: email.toLowerCase(), code, expiresAt });
    await sendCodeMail({ to: email, subject: 'Verify your email', code });
    return res.json({ success: true, message: 'Code sent' });
  } catch (e) {
    return res.json({ success: false, message: 'Failed to send code', error: e.message });
  }
});

// Confirm signup with code and create user
router.post('/signup/confirm', async (req, res) => {
  try {
    const { username, name, email, password, code } = req.body;
    if (!username || !name || !email || !password || !code) return res.json({ success: false, message: 'Missing fields' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.json({ success: false, message: 'Email already exists' });
    const rec = await EmailCode.findOne({ email: email.toLowerCase(), purpose: 'signup' });
    if (!rec) return res.json({ success: false, message: 'Code not found. Request a new one.' });
    if (rec.expiresAt < new Date()) return res.json({ success: false, message: 'Code expired' });
    if (rec.code !== String(code).trim()) return res.json({ success: false, message: 'Invalid code' });
    await EmailCode.deleteOne({ _id: rec._id });
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, name, email: email.toLowerCase(), password: hash, emailVerified: true });
    return res.json({ success: true, message: 'Account created' });
  } catch (e) { return res.json({ success: false, message: 'Signup failed', error: e.message }); }
});

// Request reset code
router.post('/forgot/request-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: 'Email required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: true, message: 'If that email exists, a code has been sent' });
    const key = recentKey('reset', email);
    const now = Date.now();
    if (lastSent.has(key) && now - lastSent.get(key) < RATE_LIMIT_MS) {
      return res.json({ success: false, message: 'Please wait a minute before requesting another code' });
    }
    lastSent.set(key, now);
    const code = genCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);
    await EmailCode.deleteMany({ email: email.toLowerCase(), purpose: 'reset' });
    await EmailCode.create({ purpose: 'reset', email: email.toLowerCase(), code, expiresAt });
    await sendCodeMail({ to: email, subject: 'Reset your password', code });
    return res.json({ success: true, message: 'Code sent' });
  } catch (e) { return res.json({ success: false, message: 'Failed to send code', error: e.message }); }
});

// Confirm reset and set new password
router.post('/forgot/confirm', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.json({ success: false, message: 'Missing fields' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: false, message: 'User not found' });
    const rec = await EmailCode.findOne({ email: email.toLowerCase(), purpose: 'reset' });
    if (!rec) return res.json({ success: false, message: 'Code not found' });
    if (rec.expiresAt < new Date()) return res.json({ success: false, message: 'Code expired' });
    if (rec.code !== String(code).trim()) return res.json({ success: false, message: 'Invalid code' });
    await EmailCode.deleteOne({ _id: rec._id });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ success: true, message: 'Password updated' });
  } catch (e) { return res.json({ success: false, message: 'Reset failed', error: e.message }); }
});

module.exports = router;