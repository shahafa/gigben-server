const { check, validationResult } = require('express-validator/check');
const { matchedData } = require('express-validator/filter');
const jwt = require('jsonwebtoken');
const uuid = require('uuid/v4');
const moment = require('moment');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { successObject, errorObject } = require('../lib/util');
const {
  ERROR_VALIDATION_FAILED,
  ERROR_SOMETHING_BAD_HAPPEND,
  ERROR_INVALID_EMAIL_PASSWORD,
  ERROR_EMAIL_ALREADY_EXISTS,
  ERROR_INVALID_CODE,
  ERROR_EXPIRED_CODE,
} = require('../consts');

const generateToken = user =>
  jwt.sign(
    {
      user: {
        id: user.id,
        email: user.email,
        verified: user.verified,
      },
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' },
  );

const generateVerificationCode = () => Math.floor((Math.random() * 900000) + 100000);

const sendVerificationEmail = (email, code) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: '"Gigben 👻" <do-not-reply@gigben.com>',
    to: 'gigben@yopmail.com',
    subject: '😋 Welcome to Gigben',
    text: `Gigben verification code: ${code}`,
  };

  transporter.sendMail(mailOptions);
};

const validateEmailPassword = () => [
  check('email')
    .exists()
    .withMessage('email field is missing'),
  check('email')
    .isEmail()
    .withMessage('email is not valid'),
  check('password')
    .exists()
    .withMessage('password field is missing'),
  check('password', 'password must be at least 8 characters long').isLength({ min: 8 }),
];

const signup = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      return res
        .status(409)
        .send(
          errorObject(ERROR_EMAIL_ALREADY_EXISTS, 'Account with that email address already exists'),
        );
    }

    const verificationCode = generateVerificationCode();

    const user = new User({
      id: uuid(),
      email: data.email,
      password: data.password,
      verified: false,
      verificationCode,
      verificationCodeTimestamp: Date.now(),
    });

    await user.save();

    sendVerificationEmail(user.email, verificationCode);

    return res.send(successObject('Sign up success', { token: generateToken(user) }));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

const validateVerify = () => [
  check('id')
    .exists()
    .withMessage('id field is missing'),
  check('code')
    .exists()
    .withMessage('code field is missing'),
];

const verify = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const user = await User.findOne({ id: data.id });
    if (!user) {
      return res
        .status(401)
        .send(errorObject(ERROR_INVALID_CODE, 'Invalid code, please try again'));
    }

    if (moment().diff(moment(user.verificationCodeTimestamp), 'minutes') > 9) {
      return res
        .status(401)
        .send(
          errorObject(ERROR_EXPIRED_CODE, 'Code is expired, please refresh page and try again'),
        );
    }

    const verificationCodeIsMatch = await user.compareVerificationCode(data.code);
    if (!verificationCodeIsMatch) {
      return res
        .status(401)
        .send(errorObject(ERROR_INVALID_CODE, 'Invalid code, please try again'));
    }

    user.verified = true;
    await user.save();

    return res.send(successObject('Account verified successfully', { token: generateToken(user) }));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

const login = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const user = await User.findOne({ email: data.email.toLowerCase() });
    if (!user) {
      return res
        .status(401)
        .send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
    }

    const passwordIsMatch = await user.comparePassword(data.password);
    if (!passwordIsMatch) {
      return res
        .status(401)
        .send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
    }

    if (!user.verified) {
      const verificationCode = generateVerificationCode();

      user.verified = false;
      user.verificationCode = verificationCode;
      user.verificationCodeTimestamp = Date.now();
      await user.save();

      sendVerificationEmail(user.email, verificationCode);
    }

    return res.send(successObject('Login success', { token: generateToken(user) }));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  validateEmailPassword,
  validateVerify,
  signup,
  verify,
  login,
};
