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

const getDate = (numberOfPastMonths) => {
  const currentTime = new Date();
  const month = currentTime.getMonth() + 1;
  const day = currentTime.getDate();
  const year = currentTime.getFullYear() - (numberOfPastMonths / 12);
  return year + '-' + strPad(month) + '-' + strPad(day);
}

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
    const transactions = await plaidClient.getTransactions(accessToken, getDate(24), getDate(0));

    const BankAccount = new Bank({
      accounts: accounts.accounts,
      transactions: transactions.transactions,
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
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in status :(', err));
  }
};

function getTransactionsCategories(transactions) {
  const categoriesSet = new Set();
  transactions.filter(transaction => { if (transaction.category != null) { transaction.category.filter(category => categoriesSet.add(category)); } });
  return categoriesSet;
}


function getTransactionsByFieldName(transactions, categoryName) {
  return transactions.filter(transaction => transaction.name.includes(categoryName));
}

function getTransactionsByFieldCategory(transactions, categoryName) {
  return transactions.filter(transaction => { if (transaction.category != null) { return transaction.category.includes(categoryName) } });
}

function getSumTransactionByMonth(transactions, month) {
  const filteredByMonth = transactions.filter(transaction => transaction.date.split('-')[1] - 1 === monthNames.indexOf(month));
  return filteredByMonth.reduce((sum, transaction) => sum + transaction.amount, 0);
}

function getArraySumTransactions(transactions, arrayMonths) {
  return arrayMonths.map(month => getSumTransactionByMonth(transactions, month));
}

function strPad(n) {
  return String(`00${n}`).slice(-2);
}

function getMonthLabels(startDate, endDate) {
  const arrMonths = [];
  while (startDate < endDate) {
    arrMonths.push(monthNames[startDate.getMonth()]);
    startDate.setMonth(startDate.getMonth() + 1);
  }

  return arrMonths;
};

function getPlatformsMap(plaformsNames, arrayMonths, transactions) {
  const plaformsTranscations = plaformsNames.map(name => getTransactionsByFieldName(transactions, name));
  return plaformsTranscations.map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths));
}

function getCategoriesMap(plaformsNames, arrayMonths, transactions) {
  const plaformsTranscations = plaformsNames.map(name => getTransactionsByFieldCategory(transactions, name));
  return plaformsTranscations.map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths));
}

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
    const year = currentTime.getFullYear();
    const lastYearDate = new Date();
    lastYearDate.setFullYear(year - 1);
    const today = getDate(0);
    const lastYear = getDate(12);
    const transactions = await plaidClient.getTransactions(accessToken, lastYear, today);
    const arrMonths = getMonthLabels(lastYearDate, currentTime);
    const platforms = ['Uber', 'fiverr'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, transactions.transactions);
    return res.send({ labels: arrMonths, platforms: [{ name: platforms[0], data: platformsSumArr[0] }, { name: platforms[1], data: platformsSumArr[1] }] });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in income :(', err));
  }
};

const netpay = async (req, res) => {
  req.assert('plaidPublicToken', 'plaidPublicToken field is missing').notEmpty();
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  const publicToken = req.body.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const currentTime = new Date();
    const year = currentTime.getFullYear();
    const lastYearDate = new Date();
    lastYearDate.setFullYear(year - 1);
    const today = getDate(0);
    const lastYear = getDate(12);
    const transactions = await plaidClient.getTransactions(accessToken, lastYear, today);
    const arrMonths = getMonthLabels(lastYearDate, currentTime);
    const paymentsByMonth = getArraySumTransactions(transactions.transactions, arrMonths);
    const incomeByMonth = [400, 500, 600, 200, 0, 255, 500, 1000, 8000, 6100, 123, 245];
    const totalNetPay = incomeByMonth.map((income, index) => { return parseInt(income - paymentsByMonth[index], 10); });
    return res.send({ labels: arrMonths, data: totalNetPay });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in netpay :(', err));
  }
};

const deductions = async (req, res) => {
  req.assert('plaidPublicToken', 'plaidPublicToken field is missing').notEmpty();
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  const publicToken = req.body.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const currentTime = new Date();
    const year = currentTime.getFullYear();
    const lastYearDate = new Date();
    lastYearDate.setFullYear(year - 1);
    const today = getDate(0);
    const lastYear = getDate(12);
    const transactions = await plaidClient.getTransactions(accessToken, lastYear, today);
    const arrMonths = getMonthLabels(lastYearDate, currentTime);
    const platforms = ['strideHealth', 'honest dollar'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, transactions.transactions);
    return res.send({
      labels: arrMonths,
      platforms: [
        { name: platforms[0], data: platformsSumArr[0] },
        { name: platforms[1], data: platformsSumArr[1] },
      ],
    });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in netpay :(', err));
  }
};

function addCategoriesToSum(categories, sumAmount) {
  return categories.map(category => { return 'name: ' + category + ', data: ' + sumAmount[categories.indexOf(category)] });
}
   
const expenses = async (req, res) => {
  req.assert('plaidPublicToken', 'plaidPublicToken field is missing').notEmpty();
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  const publicToken = req.body.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);
    const currentTime = new Date();
    const year = currentTime.getFullYear();
    const lastYearDate = new Date();
    lastYearDate.setFullYear(year - 1);
    const today = getDate(0);
    const lastYear = getDate(12);
    const transactions = await plaidClient.getTransactions(accessToken, lastYear, today);
    const arrMonths = getMonthLabels(lastYearDate, currentTime);
    const categories = Array.from(getTransactionsCategories(transactions.transactions));
    const categoriesSumArr = getCategoriesMap(categories, arrMonths, transactions.transactions);
    const categoriesSum = addCategoriesToSum(categories, categoriesSumArr);
    return res.send({ labels: arrMonths, categories: categoriesSum });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in expenses :(', err));
  }
};

module.exports = {
  validatePlaidToken,
  login,
  status,
  income,
  netpay,
  deductions,
  expenses,
};
