let mongoose = require('mongoose');

let userSchema = new mongoose.Schema({
  name: String,
  username: String,
  email: String,
  password: String, // may be undefined/null for OAuth users
  emailVerified: { type: Boolean, default: false },
  // OAuth fields
  provider: { type: String, enum: ['google', 'github', null], default: null },
  providerId: { type: String, default: null },
  avatar: { type: String, default: null },
  lastLogin: { type: Date },
  date:{
    type: Date,
    default: Date.now
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('User', userSchema); // 'User' is the name of the collection