const path = require('path');
const jwt = require('express-jwt');
const chalk = require('chalk');
const userController = require('../controllers/user');
const earlyAccessUserController = require('../controllers/earlyAccessUser');
const plaidController = require('../controllers/plaid');

const authenticate = jwt({ secret: process.env.JWT_SECRET });

function routesConfig(app) {
  app.get('/v1/test', authenticate, (req, res) => { res.send('Hello World!'); });

  app.post('/v1/addEarlyAccessUser', earlyAccessUserController.addUser);

  app.post('/v1/signup', userController.signup);
  app.post('/v1/verify', userController.verify);
  app.post('/v1/login', userController.login);

  app.post('/v1/plaidLogin', plaidController.login);
  app.post('/v1/dashboard/status', plaidController.status);

  app.use('*', (req, res) => res.sendFile(path.join(__dirname, '/../client/index.html')));

  console.log('%s Routes configured successfully', chalk.green('✓'));
}

module.exports = routesConfig;
