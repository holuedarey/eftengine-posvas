const mongoose = require("mongoose");

const notificationServiceSchema = require("../schema/registerednotificationschema");

let notificationServiceModel = mongoose.model('RegisteredNotification', notificationServiceSchema);

module.exports = notificationServiceModel;