const mongoose = require("mongoose");

let registeredNotification = new mongoose.Schema({

    name: {
        type: String,
        index: true,
        unique: true
    },
    merchantId: {
        type: String,
        index: true,
        default: ''
    },
    terminalId:  {
        type: String,
        index: true,
        default: ''
    },
    identifier : {
        type : String,
        index: true,
        default : ''
    },
    mti : {
        type : String,
        default : ''
    },
    notificationService: {type: String, index: true},
    enabled: Boolean,
    selectors : [String]
},{
    timestamps: true,
});

module.exports = registeredNotification;