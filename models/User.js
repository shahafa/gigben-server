const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

bcrypt.Promise = global.Promise;

const userSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  verified: Boolean,
  verificationToken: String,
  verificationTokenTimestamp: Date,
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

    if (user.isModified('verificationToken')) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(user.verificationToken, salt);
      user.verificationToken = hash;
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
 * Helper method for validating user's account validation token.
 */
userSchema.methods.compareVerificationToken = async function compareToken(candidateToken) {
  return bcrypt.compare(candidateToken, this.verificationToken);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
