const mongoose = require('mongoose');
const reportsSchema = require('../schema/reportsSchema');

let ReportModel = mongoose.model('Report',reportsSchema);

module.exports = ReportModel;