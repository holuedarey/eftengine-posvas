const mongoose = require("mongoose");

const notificationServiceSchema = require("../schema/notificationserviceschema");

let notificationServiceModel = mongoose.model('NotificationService', notificationServiceSchema);

module.exports = notificationServiceModel;