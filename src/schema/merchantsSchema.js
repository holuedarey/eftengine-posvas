/**
 * @author Abolaji
 */

 const mongoose = require('mongoose');

 let merchantsSchema = mongoose.Schema({
    merchant_id: {
        type : String,
        required : true
    },
    merchant_name: String,
    merchant_phone: String,
    merchant_email: String,
    merchant_contact: String,
    merchant_address : String,
    merchant_account_nr: String,
    terminals : Array,
    enabled : {type : Boolean, default : true}
 },{timestamps : true});


 module.exports = merchantsSchema;