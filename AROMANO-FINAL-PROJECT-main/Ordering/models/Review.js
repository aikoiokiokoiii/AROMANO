const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: Number, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  review: { type: String, trim: true },
  adminReply: { type: String, trim: true, default: '' },
  adminReplyAt: { type: Date },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Review', ReviewSchema);
