const mongoose = require('mongoose');

const BankSchema = new mongoose.Schema({
  accounts: { type: Array },
}, { timestamps: true });

const Bank = mongoose.model('bank', BankSchema);
module.exports = Bank;
