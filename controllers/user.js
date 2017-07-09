const jwt = require('jsonwebtoken');
const uuid = require('uuid/v4');
const User = require('../models/User');
const { successObject, errorObject } = require('../lib/util');
const {
  ERROR_VALIDATION_FAILED,
  ERROR_SOMETHING_BAD_HAPPEND,
  ERROR_INVALID_EMAIL_PASSWORD,
  ERROR_EMAIL_ALREADY_EXISTS,
} = require('../consts');

const generateToken = user => jwt.sign({
  user: {
    id: user.id,
    email: user.email,
    profile: user.profile,
  },
}, process.env.JWT_SECRET, { expiresIn: '24h' });

const login = (req, res) => {
  req.assert('email', 'email is not valid').isEmail();
  req.assert('password', 'password cannot be blank').notEmpty();
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = req.validationErrors();
  if (errors) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors));
  }

  try {
    User.findOne({ email: req.body.email.toLowerCase() }, (err, user) => {
      if (err) { throw (err); }

      if (!user) {
        return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
      }

      user.comparePassword(req.body.password, (err, isMatch) => {
        if (err) { throw (err); }

        if (isMatch) {
          return res.send(successObject('Login success', { token: generateToken(user) }));
        }

        return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
      });
    });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};


const signup = (req, res) => {
  req.assert('email', 'email is not valid').isEmail();
  req.assert('password', 'password must be at least 8 characters long').len(8);
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = req.validationErrors();
  if (errors) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors));
  }

  const user = new User({
    id: uuid(),
    email: req.body.email,
    password: req.body.password,
  });

  try {
    User.findOne({ email: req.body.email }, (err, existingUser) => {
      if (err) { throw (err); }

      if (existingUser) {
        return res.status(409).send(errorObject(ERROR_EMAIL_ALREADY_EXISTS, 'Account with that email address already exists', err));
      }

      user.save((err) => {
        if (err) { throw (err); }

        return res.send(successObject('Sign up success', { token: generateToken(user) }));
      });
    });
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  login,
  signup,
};
