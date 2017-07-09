require('dotenv').config();

const express = require('express');
const chalk = require('chalk');
const expressConfig = require('./config/express');
const routesConfig = require('./config/routes');
const database = require('./config/database');

database.connect();

const app = express();
expressConfig(app);
routesConfig(app);

app.listen(app.get('port'));

console.log(chalk.bold(`${chalk.green('✓')} Server listening on port ${app.get('port')} in ${app.get('env')} mode.`));
