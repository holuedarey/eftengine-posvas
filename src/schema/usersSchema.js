const mongoose = require('mongoose');

let usersSchema = new mongoose.Schema({
    username : {
        type : String,
        required : true
    },
    password : {
        type: String,
        required: true
    },
    permissions : {
        type: [String],
        required: true,
        default: []
    },
    type: {
        type: String,
        required: true,
        default: 'user'
    }
    
});


module.exports = usersSchema;
