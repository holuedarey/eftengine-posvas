const mongoose = require('mongoose');
const SocketUserSchema = require('../schema/socketUserSchema');

const SocketUserModel = mongoose.model('SocketUser',SocketUserSchema,'socketUsers');

module.exports = SocketUserModel;

SocketUserModel.getSocket = async(token)=>{
    return SocketUserModel.findOne({token : token});
}

SocketUserModel.updateSocket = async(token, Id, status)=>{
    return SocketUserModel.updateOne({token : token}, {$set : {socketId : Id, connected : status}});
}

SocketUserModel.getConnected =  async()=>{
    return SocketUserModel.find({connected : true});
}