const mongoose = require('mongoose');

let directcardconfigSchema = new mongoose.Schema({
    // name : {
    //     type : String,
    //     required : true
    // },

    // selected : {
    //     type : Array,default: []
    // },
    merchants: [String],
    bin: [String],
    useSelected : {type: Boolean, default : false},
    routeTransaction: {type: Boolean, default : false},
    routeVerve: {type: Boolean, default : false, index: true},
    routeVisa: {type: Boolean, default : false},
    routeMasterCard: {type: Boolean, default : false},
    routePrepping: {type: Boolean, default: false},
    routeBalanceEnquiry: {type: Boolean, default: false},
    handler: {type: String, index: true}
}, { timestamps: true });

directcardconfigSchema.index({ handler: 1, merchants: 1, bin: 1 }, { index: true });

module.exports = directcardconfigSchema;