const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  mimetype: { type: String, required: true },
  data: { type: String, required: true }, // base64 string
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Image', ImageSchema);
