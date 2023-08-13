/* eslint-disable func-names */

const mongoose = require('mongoose');
const userModel = require('../../model/usersModel');
const hashpassword = require('../helpers/hashPassword');

let databaseDriver =process.env.DATABASE_DRIVER || 'mongodb',
    databaseHost = process.env.DATABASE_HOST || 'localhost',
    databasePort = process.env.DATABASE_PORT || '27017',
    databaseUser = process.env.DATABASE_USER || 'eft-user',
    databasePwd = process.env.DATABASE_PWD || '4839!!Itex',
    databaseCollection = process.env.DATABASE_COLLECTION || 'eftEngine';


/** connection to mongodb */
const connect = function () {
    mongoose.Promise = global.Promise;
    mongoose.Promise = global.Promise;
    mongoose.connect(`${databaseDriver}://${databaseUser}:${databasePwd}@${databaseHost}:${databasePort}/${databaseCollection}`, {
        useNewUrlParser: true
    },(err)=>{
        console.error(err)
    });
    console.log('Connected to mongodb successfully');
};

/** Drop existing default admin user if any */
const dropAdminUser = function () {
  return userModel.findOneAndDelete({ username: 'ItexAdmin'});
};




/** close mongodb connection */
const closeConnection = function () {
  return new Promise((resolve) => {
    mongoose.connection.close(() => {
      console.log('mongodb connection closed');
      resolve();
    });
  });
};

/** seed default admin user to db */
const Seeders = {
  async seedAdminUser() {
    const password = hashpassword('itexadmin');
    return userModel.insertMany([
        {
            username: 'ItexAdmin',
            password: password,
            permissions: ['USER', 'ADMIN'],
        }

    ]);

    /** Bulk insert mongodb default roles data */
  },

};

const migration = async function () {
  await connect();
  await dropAdminUser();
  await Seeders.seedAdminUser();
  await closeConnection();

  console.log('db migration successful');
};


migration();
