const { check, validationResult } = require('express-validator/check');
const { matchedData } = require('express-validator/filter');
const moment = require('moment');
const plaid = require('plaid');
const Bank = require('../models/Bank');
const { successObject, errorObject } = require('../lib/util');
const { ERROR_SOMETHING_BAD_HAPPEND, ERROR_VALIDATION_FAILED } = require('../consts');

const plaidClient = new plaid.Client(
  process.env.PLAID_CLIENT_ID,
  process.env.PLAID_SECRET,
  process.env.PLAID_PUBLIC_KEY,
  plaid.environments[process.env.PLAID_ENV],
);

const validatePlaidToken = [
  check('plaidPublicToken')
    .exists()
    .withMessage('email field is missing'),
];

const getDate = numberOfPastMonths => moment().subtract(numberOfPastMonths, 'months').format('YYYY-MM-DD');

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
    const userIdentity = await plaidClient.getIdentity(accessToken);

    const BankAccount = new Bank({
      identity: userIdentity,
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
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in status :(', err));
  }
};

// not sure what you did here looks like code is not right let's talk about it
function getTransactionsCategories(transactions) {
  console.log(transactions);

  const categoriesSet = new Set();
  transactions.filter(transaction => { if (transaction.category != null) { transaction.category.filter(category => categoriesSet.add(category)); } });

  console.log(categoriesSet);
  return categoriesSet;
}

const getTransactionsByFieldName = (transactions, categoryName) =>
  transactions.filter(transaction => transaction.name.includes(categoryName));

const getTransactionsByFieldCategory = (transactions, categoryName) =>
  transactions.filter(
    transaction => (transaction.category ? transaction.category.includes(categoryName) : false),
  );

const getSumTransactionByMonth = (transactions, month) =>
  transactions
    .filter(transaction => moment(transaction.date, 'MM-DD-YYYY').month() === moment().months().indexOf(month))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

const getArraySumTransactions = (transactions, arrayMonths) =>
  arrayMonths.map(month => getSumTransactionByMonth(transactions, month));

const getMonthLabels = (startDate, endDate) => {
  const arrMonths = [];
  while (startDate < endDate) {
    arrMonths.push(moment().months(startDate.month()).format('MMMM'));
    startDate.month(startDate.month() + 1);
  }
  return arrMonths;
};

const getPlatformsMap = (plaformsNames, arrayMonths, transactions) =>
  plaformsNames
    .map(name => getTransactionsByFieldName(transactions, name))
    .map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths));

// const getCategoriesMap = (plaformsNames, arrayMonths, transactions) =>
//   plaformsNames
//     .map(name => getTransactionsByFieldCategory(transactions, name))
//     .map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths));

const getCategoriesSumMap = (plaformsNames, transactions) =>
  plaformsNames
    .map(name => getTransactionsByFieldCategory(transactions, name))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

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
    const transactions = await plaidClient.getTransactions(accessToken, getDate(12), getDate(0));
    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const platforms = ['Uber', 'fiverr'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, transactions.transactions);
    return res.send({
      labels: arrMonths,
      platforms: [
        { name: platforms[0], color: '#6fda44', data: platformsSumArr[0] },
        { name: platforms[1], color: '#3863a0', data: platformsSumArr[1] },
      ],
    });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in income :(', err));
  }
};

const netpay = async (req, res) => {
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
    const transactions = await plaidClient.getTransactions(accessToken, getDate(12), getDate(0));

    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const paymentsByMonth = getArraySumTransactions(transactions.transactions, arrMonths);
    const incomeByMonth = [400, 500, 600, 200, 0, 255, 500, 1000, 8000, 6100, 123, 245];
    const totalNetPay = incomeByMonth.map((monthlyIncome, index) =>
      parseInt(monthlyIncome - paymentsByMonth[index], 10),
    );
    return res.send({ labels: arrMonths, data: totalNetPay });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in netpay :(', err));
  }
};

const deductions = async (req, res) => {
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
    const transactions = await plaidClient.getTransactions(accessToken, getDate(12), getDate(0));
    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const platforms = ['strideHealth', 'honest dollar'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, transactions.transactions);
    return res.send({
      labels: arrMonths,
      platforms: [
        { name: platforms[0], color: '#FF7B99', data: platformsSumArr[0] },
        { name: platforms[1], color: '#4EAFEE', data: platformsSumArr[1] },
      ],
    });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in netpay :(', err));
  }
};

const addCategoriesToSum = (categories, sumAmount) =>
  categories.map(category => `name: ${category}, value: ${sumAmount[categories.indexOf(category)]}`);

const expenses = async (req, res) => {
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
    const transactions = await plaidClient.getTransactions(accessToken, getDate(12), getDate(0));
    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const categories = Array.from(getTransactionsCategories(transactions.transactions));
    const categoriesSumArr = getCategoriesSumMap(categories, arrMonths, transactions.transactions);
    const categoriesSumJson = addCategoriesToSum(categories, categoriesSumArr);
    return res.send({ categoriesSumJson });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in expenses :(', err));
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
