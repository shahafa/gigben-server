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

  const userId = req.user.user.id;
  const publicToken = data.plaidPublicToken;

  try {
    const { access_token: accessToken } = await plaidClient.exchangePublicToken(publicToken);

    const values = await Promise.all([
      plaidClient.getAccounts(accessToken),
      plaidClient.getTransactions(accessToken, getDate(12), getDate(0)),
      plaidClient.getIdentity(accessToken),
      plaidClient.getBalance(accessToken),
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

    const balanceAccounts = BankAccount.balance;
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

const getTransactionsCategories = transactions =>
  uniq(
    transactions.map(transcation => (transcation.category ? transcation.category[0] : 'undefined')),
  ).filter(e => e !== 'undefined');

const getTransactionsByFieldName = (transactions, categoryName) =>
  transactions.filter(transaction => transaction.name.includes(categoryName));

const getTransactionsByMonth = (transactions, month) =>
  transactions.filter(
    transaction => moment(transaction.date, 'YYYY-MM-DD').month() === (moment().month(month).format('M') - 1));

const getSumTransactionByMonth = (transactions, month) => {
  const monthlyTransactions = getTransactionsByMonth(transactions, month);
  return Math.round(monthlyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0));
};

const getSumTransactionByCategory = (transactions, category) => {
  const categoryTransactions = transactions.filter(transaction => (transaction.category ? transaction.category.includes(category) : false));
  return Math.round(categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0));
};

const getArraySumTransactions = (transactions, arrayMonths) =>
  arrayMonths.map(month => getSumTransactionByMonth(transactions, month));

const getMonthLabels = (startDate, endDate) => {
  const arrMonths = [];
  while (startDate < endDate) {
    arrMonths.push(moment().month(startDate.month()).format('MMMM'));
    startDate.month(startDate.month() + 1);
  }
  return arrMonths;
};

const getPlatformsMap = (plaformsNames, arrayMonths, transactions) =>
  plaformsNames
    .map(name => getTransactionsByFieldName(transactions, name))
    .map(platformTrans => getArraySumTransactions(platformTrans, arrayMonths));

const getCategoriesSumMap = (plaformsNames, transactions) =>
  plaformsNames.map(name => getSumTransactionByCategory(transactions, name));

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

    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const platforms = ['Uber', 'fiverr'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, BankAccount.transactions);
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

    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const paymentsByMonth = getArraySumTransactions(BankAccount.transactions, arrMonths);
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
    const now = moment();
    const lastYear = moment().subtract(1, 'years');
    const arrMonths = getMonthLabels(lastYear, now);
    const platforms = ['strideHealth', 'honest dollar'];
    const platformsSumArr = getPlatformsMap(platforms, arrMonths, BankAccount.transactions);
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
    const categories = getTransactionsCategories(BankAccount.transactions);
    const categoriesSumArr = getCategoriesSumMap(categories, BankAccount.transactions);
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
