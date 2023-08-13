const mongoose = require('mongoose');
const stateDataSchema = require('../schema/stateDataSchema');

module.exports = StateDataModel = mongoose.model('StateData',stateDataSchema);

