const mongoose = require("mongoose");

const usersSchema = require("../schema/usersSchema");

let usersModel = mongoose.model('Users', usersSchema);

module.exports = usersModel;