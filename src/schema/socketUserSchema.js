const mongoose = require('mongoose');

const SocketUserSchema = new mongoose.Schema({
    token : String,
    socketId : String,
    connected : {
        type : Boolean,
        default : false
    }
},{timestamps : true});


module.exports = SocketUserSchema;