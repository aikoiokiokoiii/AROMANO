const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, enum: ['order', 'wishlist', 'review'] },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  relatedId: { type: mongoose.Schema.Types.Mixed }, // Can be ObjectId or Number
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', NotificationSchema);
