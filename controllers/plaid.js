const plaid = require('plaid');
const Bank = require('../models/Bank');
const { successObject, errorObject } = require('../lib/util');
const {
  ERROR_SOMETHING_BAD_HAPPEND,
  ERROR_VALIDATION_FAILED,
} = require('../consts');

const plaidClient = new plaid.Client(
  process.env.PLAID_CLIENT_ID,
  process.env.PLAID_SECRET,
  process.env.PLAID_PUBLIC_KEY,
  plaid.environments[process.env.PLAID_ENV],
);

const login = async (req, res) => {
  req.assert('plaidPublicToken', 'plaidPublicToken field is missing').notEmpty();
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  const publicToken = req.body.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const accounts = await plaidClient.getAccounts(accessToken);

    const BankAccount = new Bank({
      accounts: accounts.accounts,
    });

    await BankAccount.save();

    return res.send(successObject(accounts));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

function filterCredit(account) {
  return account.type === "credit";
}

const status = async (req, res) => {
  req.assert('plaidPublicToken', 'plaidPublicToken field is missing').notEmpty();
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  const publicToken = req.body.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const balance = await plaidClient.getBalance(accessToken);
    const balanceAccounts = balance.accounts;
    const sum = balanceAccounts.reduce((sum, account) => sum + account.balances.current, 0);
    const creditCards = balanceAccounts.filter(filterCredit);
    const sumCredits = creditCards.reduce((sum, account) => sum + account.balances.current, 0);
    return res.send({ bankBalance: sum, creditCards: sumCredits });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  login,
  status,
};
