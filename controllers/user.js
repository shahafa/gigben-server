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

const generateToken = user => jwt.sign({
  user: {
    id: user.id,
    email: user.email,
    verified: user.verified,
  },
}, process.env.JWT_SECRET, { expiresIn: '24h' });

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
    subject: 'Hello ✔',
    text: `Gigben verification code: ${code}`,
  };

  transporter.sendMail(mailOptions);
};

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

    const verificationCode = generateVerificationCode();

    const user = new User({
      id: uuid(),
      email: req.body.email,
      password: req.body.password,
      verified: false,
      verificationCode,
      verificationCodeTimestamp: Date.now(),
    });

    await user.save();

    sendVerificationEmail(user.email, verificationCode);

    return res.send(successObject('Sign up success', { token: generateToken(user) }));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

const verify = async (req, res) => {
  req.assert('id', 'id field is missing').notEmpty();
  req.assert('code', 'code field is missing').notEmpty();
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  try {
    const user = await User.findOne({ id: req.body.id });
    if (!user) {
      return res.status(401).send(errorObject(ERROR_INVALID_CODE, 'Invalid code, please try again'));
    }

    if (moment().diff(moment(user.verificationCodeTimestamp), 'minutes') > 9) {
      return res.status(401).send(errorObject(ERROR_EXPIRED_CODE, 'Code is expired, please refresh page and try again'));
    }

    const verificationCodeIsMatch = await user.compareVerificationCode(req.body.code);
    if (!verificationCodeIsMatch) {
      return res.status(401).send(errorObject(ERROR_INVALID_CODE, 'Invalid code, please try again'));
    }

    user.verified = true;
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

    const passwordIsMatch = await user.comparePassword(req.body.password);
    if (!passwordIsMatch) {
      return res.status(401).send(errorObject(ERROR_INVALID_EMAIL_PASSWORD, 'Invalid email or password'));
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
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  signup,
  verify,
  login,
};
