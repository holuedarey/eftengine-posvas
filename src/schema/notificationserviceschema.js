const mongoose = require("mongoose");

let notificationServiceSchema = new mongoose.Schema({

    name: String,
    url: String,
    parameters: JSON,
    key: String,
    reversalUrl: String,
    notificationClass: String,
    authorizationToken: String,
    enabled: Boolean

});

module.exports = notificationServiceSchema;