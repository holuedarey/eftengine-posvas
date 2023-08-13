const mongoose = require('mongoose');

let agencyRoutingConfigSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    selectors : [String],
    route_all_nibss : {
        type : Boolean,
        default : true
    },
    route_all_upsl : {
        type : Boolean,
        default : true
    },
    route_all_isw : {
        type : Boolean,
        default : false
    },
    useInterswitch_selected_cards :[String],
    useUpsl_selected_cards: [String],
    useNibss_selected_cards: [String],
}, { timestamps: true });


module.exports = agencyRoutingConfigSchema;