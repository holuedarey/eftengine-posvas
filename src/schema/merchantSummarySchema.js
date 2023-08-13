const mongoose = require('mongoose');

const merchantSummarySchema = new mongoose.Schema({
    refCode : {
        type : String,
        unique : true
    },
    merchantId : String,
    merchantName : String,
    merchantAddr : String,
    transactionCount : {
        type : Number,
        default : 0
    },
    totalAmount : {
        type : Number,
        default : 0
    },
    statusCode : String,
    messageReason : String,
    cardScheme : {
        type :String,
        default : "UNKNOWN"
    },
    terminalId : String,
    handler: String
},{timestamps : true});


module.exports = merchantSummarySchema;