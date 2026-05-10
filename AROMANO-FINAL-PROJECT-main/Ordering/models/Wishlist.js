const mongoose = require('mongoose');

const WishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{ type: Number }],
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', WishlistSchema);
