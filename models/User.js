const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

bcrypt.Promise = global.Promise;

const userSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  verified: Boolean,
  verificationCode: String,
  verificationCodeTimestamp: Date,
}, { timestamps: true });


/**
 * Password hash middleware.
 */
userSchema.pre('save', async function save(next) {
  const user = this;

  try {
    if (user.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(user.password, salt);
      user.password = hash;
    }

    if (user.isModified('verificationCode')) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(user.verificationCode, salt);
      user.verificationCode = hash;
    }

    return next();
  } catch (err) {
    return next(err);
  }
});


/**
 * Helper method for validating user's password.
 */
userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};


/**
 * Helper method for validating user's account validation code.
 */
userSchema.methods.compareVerificationCode = async function compareCode(candidateCode) {
  return bcrypt.compare(candidateCode, this.verificationCode);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
