const uuid = require('uuid/v4');
const EarlyAccess = require('../models/EarlyAccess');
const { successObject, errorObject } = require('../lib/util');
const {
  ERROR_VALIDATION_FAILED,
  ERROR_SOMETHING_BAD_HAPPEND,
  ERROR_EMAIL_ALREADY_EXISTS,
} = require('../consts');

const addUser = async (req, res) => {
  req.assert('email', 'email field is missing').notEmpty();
  req.assert('email', 'email is not valid').isEmail();
  req.sanitize('email').normalizeEmail({ remove_dots: false });
  const errors = await req.getValidationResult();
  if (!errors.isEmpty()) {
    return res.status(400).send(errorObject(ERROR_VALIDATION_FAILED, 'Validation Failed', errors.array()));
  }

  try {
    const existingEmail = await EarlyAccess.findOne({ email: req.body.email });
    if (existingEmail) {
      return res.status(409).send(errorObject(ERROR_EMAIL_ALREADY_EXISTS, 'Email address already exists'));
    }

    const earlyAccessUser = new EarlyAccess({
      id: uuid(),
      email: req.body.email,
    });

    await earlyAccessUser.save();

    // sendVerificationEmail(user.email, verificationCode);

    return res.send(successObject('Early access sign up success'));
  } catch (err) {
    return res.status(500).send(errorObject(ERROR_SOMETHING_BAD_HAPPEND, 'Something bad happened :(', err));
  }
};

module.exports = {
  addUser,
};
