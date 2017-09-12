const { check, validationResult } = require('express-validator/check');
const { matchedData } = require('express-validator/filter');
const plaid = require('plaid');
const Bank = require('../models/Bank');
const { successObject, errorObject } = require('../lib/util');
const { ERROR_SOMETHING_BAD_HAPPEND, ERROR_VALIDATION_FAILED } = require('../consts');

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const plaidClient = new plaid.Client(
  process.env.PLAID_CLIENT_ID,
  process.env.PLAID_SECRET,
  process.env.PLAID_PUBLIC_KEY,
  plaid.environments[process.env.PLAID_ENV],
);

const validatePlaidToken = () => [
  check('plaidPublicToken')
    .exists()
    .withMessage('email field is missing'),
];

const login = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  const publicToken = data.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const accounts = await plaidClient.getAccounts(accessToken);

    const BankAccount = new Bank({
      accounts: accounts.accounts,
    });

    await BankAccount.save();

    return res.send(successObject(accounts));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

const getSumAccountByFilter = (accounts, filterName) =>
  accounts
    .filter(account => account.type === filterName || account.subtype === filterName)
    .reduce((sum, account) => sum + account.balances.current, 0);

const status = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  const publicToken = data.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const balance = await plaidClient.getBalance(accessToken);
    const balanceAccounts = balance.accounts;
    const sumBalance = balanceAccounts.reduce((sum, account) => sum + account.balances.current, 0);
    const sumCredits = getSumAccountByFilter(balanceAccounts, 'credit');
    const sumSavings = getSumAccountByFilter(balanceAccounts, 'savings');

    return res.send({
      bankBalance: sumBalance,
      creditCards: sumCredits,
      loans: 3184,
      investments: sumSavings,
      retiementBalance: 10232,
    });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

const getTransactionsByCategory = (transactions, categoryName) =>
  transactions.filter(transaction => transaction.name.includes(categoryName));

const getSumTransactionByMonth = (transactions, month) =>
  transactions
    .filter(transaction => transaction.date.split('-')[1] - 1 === monthNames.indexOf(month))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

const getArraySumTransactions = (transactions, arrayMonths) =>
  arrayMonths.map(month => getSumTransactionByMonth(transactions, month));

function strPad(n) {
  return String(`00${n}`).slice(-2);
}

const getMonthLabels = (startDate, endDate) => {
  const arrMonths = [];
  while (startDate < endDate) {
    arrMonths.push(monthNames[startDate.getMonth()]);
    startDate.setMonth(startDate.getMonth() + 1);
  }

  return arrMonths;
};

const getPlatformsMap = (plaformsNames, arrayMonths, transactions) =>
  plaformsNames
    .map(name => getTransactionsByCategory(transactions, name))
    .map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths));

const income = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  const publicToken = data.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const currentTime = new Date();
    const month = currentTime.getMonth() + 1;
    const day = currentTime.getDate();
    const year = currentTime.getFullYear();
    const lastYearDate = new Date();
    lastYearDate.setFullYear(year - 1);
    const today = `${year}-${strPad(month)}-${strPad(day)}}`;
    const lastYear = `${year - 1}-${strPad(month)}-${strPad(day)}}`;
    const transactions = await plaidClient.getTransactions(accessToken, lastYear, today);
    const arrMonths = getMonthLabels(lastYearDate, currentTime);
    const platforms = ['KFC', 'fiverr'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, transactions.transactions);
    return res.send({
      labels: arrMonths,
      platforms: [
        { name: platforms[0], data: platformsSumArr[0] },
        { name: platforms[1], data: platformsSumArr[1] },
      ],
    });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  validatePlaidToken,
  login,
  status,
  income,
};
