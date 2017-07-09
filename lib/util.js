const { SUCCESS } = require('../consts');

const successObject = (message, opt) => Object.assign({}, { code: SUCCESS, message }, opt);

const errorObject = (errorCode, message, errors = []) => ({
  code: errorCode,
  message,
  errors,
});

module.exports = {
  successObject,
  errorObject,
};
