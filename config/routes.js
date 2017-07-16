const path = require('path');
const jwt = require('express-jwt');
const chalk = require('chalk');
const userController = require('../controllers/user');

const authenticate = jwt({ secret: process.env.JWT_SECRET });

function routesConfig(app) {
  app.get('/v1/test', authenticate, (req, res) => { res.send('Hello World!'); });

  app.post('/v1/signup', userController.signup);
  app.post('/v1/verify', userController.verify);
  app.post('/v1/login', userController.login);

  app.use('*', (req, res) => res.sendFile(path.join(__dirname, '/../client/index.html')));

  console.log('%s Routes configured successfully', chalk.green('✓'));
}

module.exports = routesConfig;
