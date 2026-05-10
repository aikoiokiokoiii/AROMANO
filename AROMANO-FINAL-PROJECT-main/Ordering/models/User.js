const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  first_name: { type: String, trim: true },
  last_name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
