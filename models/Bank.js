const mongoose = require('mongoose');

const BankSchema = new mongoose.Schema(
  {
    userId: { type: String, index: { unique: true } },
    identity: { type: Array },
    accounts: { type: Array },
    balance: { type: Array },
    transactions: { type: Array },
  },
  { timestamps: true },
);

const Bank = mongoose.model('bank', BankSchema);
module.exports = Bank;
