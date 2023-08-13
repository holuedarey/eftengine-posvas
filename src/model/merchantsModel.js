/**
 * @author Abolaji
 */
const mongoose = require('mongoose');
const merchantSchema = require('../schema/merchantsSchema');

let merchantsModel = mongoose.model('Merchants',merchantSchema);

module.exports = merchantsModel;