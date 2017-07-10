const jwt = require('jsonwebtoken');
const uuid = require('uuid/v4');
const moment = require('moment');
const User = require('../models/User');
const { successObject, errorObject } = require('../lib/util');
const {
  ERROR_VALIDATION_FAILED,
  ERROR_SOMETHING_BAD_HAPPEND,
  ERROR_INVALID_EMAIL_PASSWORD,
  ERROR_EMAIL_ALREADY_EXISTS,
  ERROR_INVALID_EMAIL_TOKEN,
  ERROR_EXPIRED_TOKEN,
  ERROR_ACCOUNT_VERIFICATION,
} = require('../consts');

const generateToken = user => jwt.sign({
  user: {
    id: user.id,
    email: user.email,
    profile: user.profile,
  },
}, process.env.JWT_SECRET, { expiresIn: '24h' });


const signup = async (req, res) => {
  req.assert('email', 'email field is missing').notEmpty();
  req.assert('email', 'email is not valid').isEmail();
  req.assert('password', 'password field is missing').notEmpty();
  req.assert('password', 'password must be at least 8 characters long').len(8);
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  try {
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(409).send(errorObject(ERROR_EMAIL_ALREADY_EXISTS, 'Account with that email address already exists'));
    }

    const verificationToken = Math.floor((Math.random() * 900000) + 100000);

    const user = new User({
      id: uuid(),
      email: req.body.email,
      password: req.body.password,
      accountVerified: false,
      accountVerificationToken: verificationToken,
      accountVerificationTokenTimestamp: Date.now(),
    });

    await user.save();
    console.log(verificationToken); // TODO send email

    return res.send(successObject('Sign up success'));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};


const verificationEmail = async (req, res) => {
  req.assert('email', 'email field is missing').notEmpty();
  req.assert('email', 'email is not valid').isEmail();
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) {
      return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :('));
    }

    const verificationToken = Math.floor((Math.random() * 900000) + 100000);

    user.accountVerified = false;
    user.accountVerificationToken = verificationToken;
    user.accountVerificationTokenTimestamp = Date.now();
    await user.save();

    console.log(verificationToken); // TODO send email

    return res.send(successObject('Verification email sent successfuly'));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};


const verifyAccount = async (req, res) => {
  req.assert('email', 'email field is missing').notEmpty();
  req.assert('email', 'email is not valid').isEmail();
  req.assert('token', 'token field is missing').notEmpty();
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) {
      return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_TOKEN, 'Invalid email or token'));
    }

    if (moment().diff(moment(user.accountVerificationTokenTimestamp), 'minutes') > 9) {
      return res.status(401).send(errorObject(ERROR_EXPIRED_TOKEN, 'Token is expired'));
    }

    const verificationTokenIsMatch = await user.compareVerificationToken(req.body.token);
    if (!verificationTokenIsMatch) {
      return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_TOKEN, 'Invalid email or token'));
    }

    user.accountVerified = true;
    await user.save();

    return res.send(successObject('Account verified successfully', { token: generateToken(user) }));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};


const login = async (req, res) => {
  req.assert('email', 'email field is missing').notEmpty();
  req.assert('email', 'email is not valid').isEmail();
  req.assert('password', 'password field is missing').notEmpty();
  req.assert('password', 'password cannot be blank').notEmpty();
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) {
      return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
    }

    if (!user.accountVerified) {
      return res.status(401).send(errorObject(ERROR_ACCOUNT_VERIFICATION, 'Account is not verified, please verifiy account'));
    }

    const passwordIsMatch = await user.comparePassword(req.body.password);
    if (!passwordIsMatch) {
      return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
    }

    return res.send(successObject('Login success', { token: generateToken(user) }));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  signup,
  verificationEmail,
  verifyAccount,
  login,
};
