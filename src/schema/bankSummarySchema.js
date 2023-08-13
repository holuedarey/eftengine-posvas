const mongoose = require('mongoose');


const bankSummarySchema = new mongoose.Schema({
    refCode : {
        type: String,
        unique : true
    },
    bankCode : String,
    bankName : String,
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
    handler : String

},{timestamps : true});

module.exports = bankSummarySchema;