const mongoose = require('mongoose');

const emailCodeSchema = new mongoose.Schema({
  purpose: { type: String, enum: ['signup', 'reset'], required: true },
  email: { type: String, required: true, index: true },
  code: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

emailCodeSchema.index({ email: 1, purpose: 1 });

module.exports = mongoose.model('EmailCode', emailCodeSchema);
