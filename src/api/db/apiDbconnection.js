/**
 * @author Adesola
 * @description Itex Integrated Property.
 */
const mongoose = require('mongoose');

const conn = mongoose.createConnection(process.env.LIVE_DB_SEC_URL);

module.exports = conn;
