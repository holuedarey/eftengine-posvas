/**
 * @author Abolaji
 */

const mongoose = require('mongoose');

const terminalKeySchema = new mongoose.Schema({
    terminalId : {
        type : String,
        index: true,
        require : true
    },
    
    // required for nibss
    masterKey_1 : {type: String, index: true},
    masterKey_2 : String,
    pinKey_1 : {type: String, index: true},
    pinKey_2 : String,
    sessionKey_1 : {type: String, index: true},
    sessionKey_2 : String,

    // required for tams
    batchNo : {
        type : Number,
        default : 0
    },
    sequenceNumber : {
        type :Number,
        default : 0
    },
    masterKey_tams : String,
    sessionKey_tams0 : String,
    sessionKey_tams1 : String,
    sessionKey_tams2 : String,
    mechantID_tams: String,
    countryCode_tams : String,

    // required for interswitch
    is_TERMINAL_KEY : String,
    is_KEY_ALIAS : String,
    nibss_merchantId : String,
    terminal_imei : String,

    /**
     * TMK : string,
     * TSK : string,
     * TPK : string
     * PARAM : object
    */
    upslKey : {
        type : Object,
        default : null
    }


},{ timestamps: true });

module.exports = terminalKeySchema;