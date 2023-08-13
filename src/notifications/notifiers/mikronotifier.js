require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

//created by kayode shobalaje
class MikroNotifier {

    constructor(notificationService, notificationData) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;

    }

    signRequest(username, password) {
        //Authorization
        let data = username + ':' + password;
        let encrypted = Buffer.from(data).toString('base64');
         
        return encrypted;
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

                //console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-mikr");

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
        //     return false;

        if(this.notificationData.responseCode != '00')
            return;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        let reversal = false;

        let notificationUrl = this.notificationService.url;
        if (theMTIClass == "04"){
            notificationUrl = this.notificationService.reversalUrl;
            reversal = true;
        }

        let customerName = "";
        let customerRef = this.notificationData.customerRef;
        let refs = customerRef.split('~');
        if(refs.length > 1)
            customerName = refs[1];

        let theBody = {
            "MTI" : this.notificationData.MTI,
            "amount": (this.notificationData.amount/100),
            "terminalId": this.notificationData.terminalId,
            "responseCode": this.notificationData.responseCode,
            "messageReason": this.notificationData.messageReason,
            "PAN": this.notificationData.maskedPan,
            "RRN": this.notificationData.rrn,
            "STAN": this.notificationData.STAN,
            "authCode": this.notificationData.authCode,
            "transactionTime": this.notificationData.transactionTime,
            "reversal": reversal,
            "customerName": customerName,
            "cardExpiry": "",
            "processingCode": this.notificationData.processingCode,
            "merchantId": this.notificationData.merchantId,
            "merchantName": this.notificationData.merchantName,
            "merchantAddress": this.notificationData.merchantAddress
        };

        // console.log("theBody", theBody);

        let notificationBody = JSON.stringify(theBody);
        let authorization = this.notificationService.authorizationToken;

        let notificationHeaders = {
            'Content-Type': 'application/json',
            'Authorization' : `Basic ${authorization}`,
        };

        console.log("Notification Headers:", notificationHeaders);

        console.log("Notification URL:", notificationUrl);
        
        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return fetch(notificationUrl, {
                method: 'POST',
                headers: notificationHeaders,
                body: notificationBody
            })
            .then((response) => {
                // console.log("MIKRO Response", response);

                return response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({ rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId  },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });


                    if(data["BillerReference"] !== undefined && data["BillerReference"] !== null) {

                        return true;

                    } else {

                        return false;

                    }



                }).catch((err) => {

                    Journal.updateOne({ rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId  },{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                    return false;

                });

                


            })
            .catch((err) => {

                Journal.updateOne({ rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId  },{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

                return false;

            });

    }

}

module.exports = MikroNotifier;