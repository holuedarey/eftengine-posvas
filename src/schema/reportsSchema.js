const mongoose = require('mongoose');

let reportsSchema = new mongoose.Schema({
    type : {
        type : String,
        required : true
    },
    data : Object
},{timestamps:true});


module.exports = reportsSchema;