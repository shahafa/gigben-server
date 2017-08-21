const mongoose = require('mongoose');

const EarlyAccessUserSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  email: { type: String, unique: true },
}, { timestamps: true });

const EarlyAccessUser = mongoose.model('earlyAccessUser', EarlyAccessUserSchema);
module.exports = EarlyAccessUser;
