/** 
 * @author Abolaji
*/

const mongoose = require('mongoose');


module.exports = new mongoose.Schema({
    terminalId : {
        type : String,
        required : true
    },
    serialNumber : String,
    applicationVersion : String,
    paymentChannelModel : String,
    stateInformation : String,
    stateData : {type : Object, default : null},
    communicationsServiceProvider  : String
},{timestamps : true});