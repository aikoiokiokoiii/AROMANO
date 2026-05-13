const mongoose = require('mongoose');

const OrderTrackingSchema = new mongoose.Schema({
  order_id: { type: Number, required: true, unique: true }, // References MySQL orders.order_id
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Customer who placed the order
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  status_history: [{
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      required: true
    },
    timestamp: { type: Date, default: Date.now },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who updated
    notes: { type: String }
  }],
  estimated_delivery: { type: Date },
  tracking_number: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Add status to history when status changes
OrderTrackingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.status_history.push({
      status: this.status,
      timestamp: new Date(),
      updated_by: this._updatedBy // Set by controller
    });
    this.updated_at = new Date();
  }
  next();
});

module.exports = mongoose.model('OrderTracking', OrderTrackingSchema);