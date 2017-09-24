const mongoose = require('mongoose');

const BankSchema = new mongoose.Schema(
  {
    identity: { type: Array },
    accounts: { type: Array },
    transactions: { type: Array },
  },
  { timestamps: true },
);

const Bank = mongoose.model('bank', BankSchema);
module.exports = Bank;
