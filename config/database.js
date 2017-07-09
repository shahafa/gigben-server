const mongoose = require('mongoose');

const connect = () => {
  mongoose.Promise = global.Promise;
  mongoose.connect(process.env.MONGODB_URI, { useMongoClient: true });

  mongoose.connection.on('open', () => {
    console.log('✨  Database connection established!');
  });

  mongoose.connection.on('error', () => {
    console.log('❗️  Database connection error.');
    process.exit();
  });
};

const disconnect = () => {
  mongoose.connection.close(() => {
    console.log('⚡️  Database connection closed');
  });
};

module.exports = {
  connect,
  disconnect,
};
