require("dotenv").config();

const NotificationService = require("../model/notificationservicemodel");

const RegisteredNotification = require("../model/registerednotificationmodel");

const requireDir = require("require-dir");

const notifiers = requireDir('./notifiers');

const Util  = require('../helpers/Util');

class BaseNotifier {

    constructor(type, modelData, details, options = {}) {

        this.type = type;
        this.modelData = modelData;
        this.details = details;
        this.options = options;
        this.notificationServices = [];

    }

    async prepareRegisteredNotificationServices() {

        try {
            // get distinct notificationServices _Id for the TID or MID
            let theRegisteredNotifications = RegisteredNotification.find({
                $or: [{
                    merchantId: this.details.merchantId
                }, {
                    terminalId: this.details.terminalId
                },
                {
                    mti: this.details.MTI
                },
                {
                    identifier: {$exists : true, $eq : Util.extractIdentifier(this.details.customerRef)}
                },{
                    selectors: { $in: [this.details.terminalId.substr(0,4)] } 
                }],
                $and: [{
                    enabled: true
                }]
            }).distinct('notificationService');

            let registeredNotifications = await theRegisteredNotifications.exec();

            // console.log(`The Found Registered Notifications ${registeredNotifications}`);

            // if TID or MID is regestered for notification
            if (registeredNotifications) {

                // get all the enabled noficationservices with their ID
                let theNotificationServices = NotificationService.find({
                    _id: {
                        $in: registeredNotifications
                    },
                    $and: [{
                        enabled: true
                    }]
                });

                let notificationServices = await theNotificationServices.exec();

                // console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationServices = notificationServices;

                    return true;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)

        }

        return false;

    }

    async sendNotifications() {

        let prepareNotifications = await this.prepareRegisteredNotificationServices();
        // if notificationServices are found
        if (prepareNotifications) {

            for (let i in this.notificationServices) {

                let notificationService = this.notificationServices[i];

                // get notification class from the object or set it as 'default'
                let notificationClass = notificationService.notificationClass || "default";

                // if notification is not sent with oncomplete event skip
                if(notificationClass.startsWith('manual'))
                    continue;

                // default notifier is transactionnotifier
                let theNotifier = notifiers.transactionnotifier;

                if(notificationClass !== "default"){

                    theNotifier = notifiers[notificationClass] || theNotifier;

                }

                let Notifier = new theNotifier(notificationService, this.modelData)

                Notifier.sendNotification();

            }

        }
    }

}

module.exports = BaseNotifier;
