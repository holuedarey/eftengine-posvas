require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Emailnotifier = require('./emailnotifier');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');

class C24Notifier {

    constructor(notificationData, options = {}) {

        this.notificationService = null;
        this.notificationData = notificationData;
        this.options = options;

    }

    signRequest(requestBody, secret) {

        let amount = requestBody.amount || '';
        let reversal = (requestBody.reversal ? 'true': 'false');
        let rrn = requestBody.rrn || '';
        let stan = requestBody.stan || '';

        let base64Encoded = Buffer.from(JSON.stringify(requestBody)).toString('base64');

        let hash = crypto.createHash('sha512');

        hash.update(base64Encoded + secret);
         
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
                },{
                    identifier: {$exists : true, $eq : Util.extractIdentifier(this.notificationData.customerRef)}
                }],
                $and: [{
                    enabled: true
                }]
            }).distinct('notificationService');

            let registeredNotifications = await theRegisteredNotifications.exec();

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

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-c24");

                    return this.notificationService != null;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error preparing registered notification services: ${err}`)

        }

        return false;

    }

    async sendNotification() {


        let hasNotifiers = await this.prepareRegisteredNotificationServices();
        if(!hasNotifiers || this.notificationService == null)
            return false;

        let reversal = false;

        let notificationUrl = this.notificationService.url;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04" && this.notificationService.reversalUrl !== null && this.notificationService.reversalUrl !== undefined) {

            notificationUrl = this.notificationService.reversalUrl;

            reversal = true;

        }

        let theBody = {
            amount: this.notificationData.amount,
            terminalId: this.notificationData.terminalId,
            statusCode: this.notificationData.responseCode,
            pan: this.notificationData.maskedPan,
            RRN: this.notificationData.rrn,
            STAN: this.notificationData.STAN,
            transactionType: "purchase",
            productId: "C24",
            transactionTime: this.notificationData.transactionTime,
            reversal: reversal,
            bank : "bank"
        };


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '+ this.notificationService.key
        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);


        return new Promise((resolve, reject) => {

                fetch(notificationUrl, {

                    method: 'post',
                    headers: notificationHeaders,
                    body: notificationBody

                })
                .then((response) => {
                    response.json().then((data) => {

                        console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                        Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                        Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                            if(err)
                                console.error(`error updating C24 notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                            else
                            console.log(`C24 notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        });

                        if (data.code !== "00") {

                            resolve(false);


                        } else {

                            resolve(data);


                        }

                    }).catch((err) => {

                        Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                            if(err)
                                console.error(`error updating C24 notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                            else
                            console.log(`C24 notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        });

                        console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                        Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                        // Emailnotifier.sendIlakErrorAlert(theBody);

                        resolve(false);

                    });


                })
                .catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating C24 notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`C24 notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

                    // Emailnotifier.sendIlakErrorAlert(theBody);

                    resolve(false);


                });




        });


    }

}

module.exports = C24Notifier;