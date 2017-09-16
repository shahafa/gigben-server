const path = require('path');
const jwt = require('express-jwt');
const chalk = require('chalk');
const userController = require('../controllers/user');
const earlyAccessUserController = require('../controllers/earlyAccessUser');
const plaidController = require('../controllers/plaid');

const authenticate = jwt({ secret: process.env.JWT_SECRET });

function routesConfig(app) {
  app.get('/v1/test', authenticate, (req, res) => { res.send('Hello World!'); });

  app.post('/v1/signup', userController.validateEmailPassword, userController.signup);
  app.post('/v1/verify', userController.validateVerify, userController.verify);
  app.post('/v1/login', userController.validateEmailPassword, userController.login);

  app.post('/v1/plaidLogin', plaidController.validatePlaidToken, plaidController.login);
  app.post('/v1/dashboard/status', plaidController.validatePlaidToken, plaidController.status);
  app.post('/v1/dashboard/income', plaidController.validatePlaidToken, plaidController.income);
  app.post('/v1/dashboard/netpay', plaidController.validatePlaidToken, plaidController.netpay);
  app.post('/v1/dashboard/deductions', plaidController.validatePlaidToken, plaidController.deductions);
  app.post('/v1/dashboard/expenses', plaidController.validatePlaidToken, plaidController.expenses);

  app.post('/v1/addEarlyAccessUser', earlyAccessUserController.validateAddUser, earlyAccessUserController.addUser);

  app.use('*', (req, res) => res.sendFile(path.join(__dirname, '/../client/index.html')));

  console.log('%s Routes configured successfully', chalk.green('✓'));
}

module.exports = routesConfig;
