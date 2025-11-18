const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  profileImage: { type: String, default: null }, // base64 or url
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // includes creator always
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  adminMode: { type: Boolean, default: false }, // if true, only admins can send
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    imageUrl: String,
    timestamp: { type: Date, default: Date.now },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  createdAt: { type: Date, default: Date.now }
});

// Ensure creator stays an admin
groupSchema.pre('save', function(next) {
  if (this.creator && (!this.admins || !this.admins.length)) {
    this.admins = [this.creator];
  }
  if (this.creator && !this.admins.find(a => String(a) === String(this.creator))) {
    this.admins.push(this.creator);
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema);
