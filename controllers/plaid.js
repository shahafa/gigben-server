const { check, validationResult } = require('express-validator/check');
const { matchedData } = require('express-validator/filter');
const moment = require('moment');
const plaid = require('plaid');
const { uniq } = require('lodash/array');
const Bank = require('../models/Bank');
const { successObject, errorObject } = require('../lib/util');
const { ERROR_SOMETHING_BAD_HAPPEND, ERROR_VALIDATION_FAILED, ERROR_NO_PERMISSION } = require('../consts');

const plaidClient = new plaid.Client(
  process.env.PLAID_CLIENT_ID,
  process.env.PLAID_SECRET,
  process.env.PLAID_PUBLIC_KEY,
  plaid.environments.development,
);

const plaidClientSandbox = new plaid.Client(
  process.env.PLAID_CLIENT_ID,
  process.env.PLAID_SECRET,
  process.env.PLAID_PUBLIC_KEY,
  plaid.environments.sandbox,
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

  const userId = req.user.user.id;
  const publicToken = data.plaidPublicToken;

  try {
    const client = publicToken.includes('development') ? plaidClient : plaidClientSandbox;

    const { access_token: accessToken } = await client.exchangePublicToken(publicToken);

    const values = await Promise.all([
      client.getAccounts(accessToken),
      client.getTransactions(accessToken, getDate(12), getDate(0)),
      client.getIdentity(accessToken),
      client.getBalance(accessToken),
    ]);

    const accountValues = {
      accounts: values[0].accounts,
      identity: values[2],
      balance: values[3].accounts,
      transactions: values[1].transactions,
    };

    let BankAccount = await Bank.findOne({ userId }).exec();
    if (BankAccount) {
      Object.assign(BankAccount, accountValues);
    } else {
      BankAccount = new Bank(Object.assign({ userId }, accountValues));
    }

    await BankAccount.save();

    return res.send(successObject());
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

const getStatus = (balanceAccounts) => {
  const sumBalance = balanceAccounts.reduce((sum, account) => sum + account.balances.current, 0);
  const sumCredits = getSumAccountByFilter(balanceAccounts, 'credit');
  const sumSavings = getSumAccountByFilter(balanceAccounts, 'savings');
  return {
    bankBalance: sumBalance,
    creditCards: sumCredits,
    loans: 0,
    investments: sumSavings,
    retiementBalance: 0,
  };
};

const status = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const userId = req.user.user.id;

    const BankAccount = await Bank.findOne({ userId }).exec();
    if (!BankAccount) {
      return res
        .status(400)
        .send(errorObject(ERROR_NO_PERMISSION));
    }

    return res.send(getStatus(BankAccount.balance));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in status :(', err));
  }
};

const getTransactionsCategories = transactions =>
  uniq(
    transactions.map(transaction => (transaction.category && transaction.amount > 0 ? transaction.category[0] : 'undefined')),
  ).filter(e => e !== 'undefined');

const getTransactionsByFieldName = (transactions, categoryName) =>
  transactions.filter(transaction => transaction.name.includes(categoryName));

const getTransactionsByMonth = (transactions, month, isDeduction) =>
  transactions.filter(
    transaction => (isDeduction ? transaction.amount > 0 : transaction.amount < 0)
    && moment(transaction.date, 'YYYY-MM-DD').month() === (moment().month(month).format('M') - 1));

const getSumTransactionByMonth = (transactions, month, isDeduction) => {
  const monthlyTransactions = getTransactionsByMonth(transactions, month, isDeduction);
  return Math.round(monthlyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0));
};

const getSumTransactionByCategory = (transactions, category) => {
  const categoryTransactions = transactions.filter(transaction => (transaction.category && transaction.amount > 0 ? transaction.category.includes(category) : false));
  return Math.round(categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0));
};

const getArraySumTransactions = (transactions, arrayMonths, isDeduction) =>
  arrayMonths.map(month => getSumTransactionByMonth(transactions, month, isDeduction));

const getMonthLabels = (startDate, endDate) => {
  const arrMonths = [];
  while (startDate < endDate) {
    arrMonths.push(moment().month(startDate.month()).format('MMMM'));
    startDate.month(startDate.month() + 1);
  }
  return arrMonths;
};

const getPlatformsMap = (plaformsNames, arrayMonths, transactions, isDeduction) =>
  plaformsNames
    .map(name => getTransactionsByFieldName(transactions, name))
    .map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths, isDeduction));

const getPlatformData = transactions =>
  transactions.filter(transaction => transaction.amount < 0).map(transaction => transaction.name);

const getCategoriesSumMap = (plaformsNames, transactions) =>
  plaformsNames.map(name => getSumTransactionByCategory(transactions, name));

const getIncome = (transactions) => {
  const now = moment();
  const lastYear = moment().subtract(1, 'years');
  const arrMonths = getMonthLabels(lastYear, now);
  const isDeduction = false;
  const platforms = getPlatformData(transactions);
  const setPlatforms = platforms.filter((elem, pos) => platforms.indexOf(elem) === pos);
  const platformsSumArr = getPlatformsMap(setPlatforms, arrMonths, transactions, isDeduction);
  const platformsJson = setPlatforms.map((name, idx) => ({
    name,
    data: platformsSumArr[idx].map(elem => elem * -1),
  }));
  return {
    labels: arrMonths,
    platforms: platformsJson,
  };
};

const income = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const userId = req.user.user.id;

    const BankAccount = await Bank.findOne({ userId }).exec();
    if (!BankAccount) {
      return res
        .status(400)
        .send(errorObject(ERROR_NO_PERMISSION));
    }

    return res.send(getIncome(BankAccount.transactions));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in income :(', err));
  }
};

const getNetpay = (transactions) => {
  const now = moment();
  const lastYear = moment().subtract(1, 'years');
  const arrMonths = getMonthLabels(lastYear, now);
  const isDeduction = true;
  const paymentsByMonth = getArraySumTransactions(transactions, arrMonths, isDeduction);
  const incomeByMonth = getArraySumTransactions(transactions, arrMonths, !isDeduction);
  const totalNetPay = incomeByMonth.map((monthlyIncome, index) =>
    parseInt((-1 * monthlyIncome) - paymentsByMonth[index], 10),
  );
  return { labels: arrMonths, data: totalNetPay };
};

const netpay = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const userId = req.user.user.id;

    const BankAccount = await Bank.findOne({ userId }).exec();
    if (!BankAccount) {
      return res
        .status(400)
        .send(errorObject(ERROR_NO_PERMISSION));
    }

    return res.send(getNetpay(BankAccount.transactions));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in netpay :(', err));
  }
};

const getDeductions = (transactions) => {
  const now = moment();
  const lastYear = moment().subtract(1, 'years');
  const arrMonths = getMonthLabels(lastYear, now);
  const platforms = ['strideHealth', 'honest dollar'];
  const isDeduction = true;
  const platformsSumArr = getPlatformsMap(platforms, arrMonths, transactions, isDeduction);
  return {
    labels: arrMonths,
    platforms: [
      { name: platforms[0], data: platformsSumArr[0] },
      { name: platforms[1], data: platformsSumArr[1] },
    ],
  };
};

const deductions = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const userId = req.user.user.id;

    const BankAccount = await Bank.findOne({ userId }).exec();
    if (!BankAccount) {
      return res
        .status(400)
        .send(errorObject(ERROR_NO_PERMISSION));
    }

    return res.send(getDeductions(BankAccount.transactions));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in netpay :(', err));
  }
};

const addCategoriesToSum = (categories, sumAmount) =>
  categories.map(category => ({
    name: category,
    value: sumAmount[categories.indexOf(category)],
  }));

const getExpenses = (transactions) => {
  const categories = getTransactionsCategories(transactions);
  const categoriesSumArr = getCategoriesSumMap(categories, transactions);
  const categoriesSumJson = addCategoriesToSum(categories, categoriesSumArr);
  return categoriesSumJson;
};

const expenses = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const userId = req.user.user.id;

    const BankAccount = await Bank.findOne({ userId }).exec();
    if (!BankAccount) {
      return res
        .status(400)
        .send(errorObject(ERROR_NO_PERMISSION));
    }

    return res.send(getExpenses(BankAccount.transactions));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in expenses :(', err));
  }
};

const dashboard = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const userId = req.user.user.id;

    const BankAccount = await Bank.findOne({ userId }).exec();
    if (!BankAccount) {
      return res
        .status(400)
        .send(errorObject(ERROR_NO_PERMISSION));
    }

    return res.send({
      status: getStatus(BankAccount.balance),
      income: getIncome(BankAccount.transactions),
      netpay: getNetpay(BankAccount.transactions),
      deductions: getDeductions(BankAccount.transactions),
      expenses: getExpenses(BankAccount.transactions),
    });
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened in dashboard :(', err));
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
  dashboard,
};