require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');

const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');

const Util = require('../../helpers/Util');
const Moment = require('moment');


class ArteziaNotifier {

    constructor(notificationService, transactionData) {

        this.notificationService = notificationService;
        this.notificationData = transactionData;
        this.options = null;

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

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-artezia");

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
        // let hasNotifiers = await this.prepareRegisteredNotificationServices();
        // if(!hasNotifiers || this.notificationService == null)
        if(this.notificationService == null)
            return false;


        if(this.notificationData.responseCode != '00')
            return;


        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04")
            return false;

        let notificationUrl = this.notificationService.url;

        let ticketNumber = "";
        let customerRef = this.notificationData.customerRef;
        if(!customerRef)
        {
            console.error(`Customer Data not found to send notification; ${this.notificationService.name} Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; IGR-PARKWAY Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }

        let refs = customerRef.split('~');
        if(refs.length > 1)
            ticketNumber = refs[1];

        let theBody = {
            "TicketNumber": ticketNumber,
            "Amount": parseFloat(this.notificationData.amount/100).toFixed(2),
            "TerminalId": this.notificationData.terminalId,
            "ResponseCode": this.notificationData.responseCode,
            "ResponseDescription": this.notificationData.messageReason,
            "PAN": this.notificationData.maskedPan,
            "RRN": this.notificationData.rrn,
            "STAN": this.notificationData.STAN,
            "AuthCode": this.notificationData.authCode || "",
            "TransactionTime": require('moment-timezone')(this.notificationData.transactionTime).tz("Africa/Lagos").format("YYYY-MM-DD HH:mm:ss"),
            "Reversal": false,
            "MerchantId": this.notificationData.merchantId,
            "MerchantName": this.notificationData.merchantName,
            "merchantAddress": this.notificationData.merchantAddress,
            "App_Bank": "Bank"
        };

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {
            'Content-Type': 'application/json',
        };

        let requestOptions = {
            method: 'POST',
            headers: notificationHeaders,
            body: notificationBody
        };

        console.log("Notification Headers:", notificationHeaders);
        console.log("Notification Data from DB", this.notificationData);
        
        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return new Promise((resolve, reject) => {

            fetch(notificationUrl, requestOptions)
                .then((response) => {

                    response.json().then((data) => {

                        console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                        Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                        Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                            if(err)
                                console.error(`error updating ${this.notificationService.name}  notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                            else
                            console.log(`${this.notificationService.name}  notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        });

                        if(data.Result !== "Success" || data.Result === undefined) {
                        
                            resolve(false)
        
                        }
        
                        resolve(data);

                    }).catch((err) => {

                        Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                            if(err)
                                console.error(`error updating Artezia notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                            else
                            console.log(`${this.notificationService.name}  notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        });

                        console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                        Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                        resolve(false);
                    });


                })
                .catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating ${this.notificationService.name}  notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`${this.notificationService.name}  notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

                    resolve(false);
                });

        })
    }

}

module.exports = ArteziaNotifier;