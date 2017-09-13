const { check, validationResult } = require('express-validator/check');
const { matchedData } = require('express-validator/filter');
const nodemailer = require('nodemailer');
const uuid = require('uuid/v4');
const EarlyAccess = require('../models/EarlyAccess');
const { successObject, errorObject } = require('../lib/util');
const {
  ERROR_VALIDATION_FAILED,
  ERROR_SOMETHING_BAD_HAPPEND,
  ERROR_EMAIL_ALREADY_EXISTS,
} = require('../consts');

const sendNewEarlyAccessUserNotificationEmail = (earlyAccessUserEmail) => {
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
    from: '"Gigben" <do-not-reply@gigben.com>',
    to: 'shahaf@gigben.com; moshe@gigben.com; ofer@gigben.com',
    subject: '👻 New early access user signed up!',
    text: `New user ${earlyAccessUserEmail} signed up`,
  };

  transporter.sendMail(mailOptions);
};

const validateAddUser = [
  check('email')
    .exists()
    .withMessage('email field is missing'),
  check('email')
    .isEmail()
    .withMessage('email is not valid'),
];

const addUser = async (req, res) => {
  const data = matchedData(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.mapped()));
  }

  try {
    const existingEmail = await EarlyAccess.findOne({ email: data.email });
    if (existingEmail) {
      return res
        .status(409)
        .send(errorObject(ERROR_EMAIL_ALREADY_EXISTS, 'Email address already exists'));
    }

    const earlyAccessUser = new EarlyAccess({
      id: uuid(),
      email: data.email,
    });

    await earlyAccessUser.save();

    sendNewEarlyAccessUserNotificationEmail(data.email);

    return res.send(successObject('Early access sign up success'));
  } catch (err) {
    return res
      .status(500)
      .send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  validateAddUser,
  addUser,
};
