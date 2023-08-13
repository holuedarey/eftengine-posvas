
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');
const https = require('https');
const crypto = require('crypto');

class JambprcNotifier {
    constructor(transactionData) {
        console.log('vas notifier triggered');
        this.notificationData = transactionData;
        this.notificationService = null;
        this.options = null;

    }


    signRequest(toHash, secret) {

        let hash = crypto.createHash('sha512');

        hash.update(toHash + secret);

        return hash.digest('hex');

    }

    async prepareRegisteredNotificationServices() {

        try {
            // get distinct notificationServices _Id for the TID or MID
            let theRegisteredNotifications = RegisteredNotification.find({
                $or: [{
                    merchantId: this.notificationData.merchantId
                }, {
                    terminalId: this.notificationData.terminalId
                }, {
                    identifier: { $exists: true, $eq: Util.extractIdentifier(this.notificationData.customerRef) }
                }],
                $and: [{
                    enabled: true
                }]
            }).distinct('notificationService');

            console.log('finding registered notification');

            let registeredNotifications = await theRegisteredNotifications.exec();

            // if TID or MID is regestered for notification
            if (registeredNotifications) {
                console.log('found registered notification', registeredNotifications);
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

                //console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationService = notificationServices.find(c => c.notificationClass == "manual-jamb");

                    return this.notificationService != null;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)
            Util.fileDataLogger(this.notificationData.terminalId, `There was an error preparing registered notification services: ${err}`)

        }

        return false;

    }

    async sendNotification(customdata) {
        console.log('send notification function triggered');
        let hasNotifiers = await this.prepareRegisteredNotificationServices();

        if (!hasNotifiers || this.notificationService == null)
            return false;

        const payload = customdata === null ? null : Object.assign({}, customdata);

        if(payload === null) {
            return false;
        }


        let notificationUrl = this.notificationService.url;

        let transStatus;
        if(this.notificationData.messageReason.toLowerCase() == "approved"){
            transStatus = "success"
        } else {
            transStatus = "failed"
        };


        let theBody = {
            service: "jambprc",
            clientReference: customdata.clientReference,
            channel: "LINUXPOS",
            transactionStatus: transStatus,
            transactionMessage: this.notificationData.messageReason,
            productCode: customdata.productCode,
            paymentMethod: "card",
            card: {
                rrn: this.notificationData.rrn,
                cardName: this.notificationData.ejournalData.card_holder_name || "ITEX INTEGRATED",
                mPan: this.notificationData.maskedPan,
                expiryDate: this.notificationData.cardExpiry,
                stan: this.notificationData.STAN,
                vTid: "",
                linuxTerinalGps: ""
            }
        };

        let notificationBody = JSON.stringify(theBody);

        console.log('notification body', theBody);

        let notificationHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId, `Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        // const httpsAgent = new https.Agent({
        //     rejectUnauthorized: false,
        //   });

        fetch(notificationUrl, {
            method: 'POST',
            headers: notificationHeaders,
            body: notificationBody,
            // agent: httpsAgent
        })
            .then((response) => {

                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId, `Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({ _id: this.notificationData._id }, { $set: { notified: JSON.stringify(data) } }, (err, data) => {
                        if (err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                }).catch((err) => {

                    Journal.updateOne({ _id: this.notificationData._id }, { $set: { notified: response.toString() } }, (err, data) => {
                        if (err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId, `There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({ _id: this.notificationData._id }, { $set: { notified: err.toString() } }, (err, data) => {
                    if (err)
                        console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId, `There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });



    }
}

module.exports = JambprcNotifier