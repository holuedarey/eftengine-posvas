const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');
const crypto = require('crypto');
require("dotenv").config();



class StanbicDstvNotifier {
    constructor(transactionData) {

        this.notificationData = transactionData;
        this.notificationService = null;
        this.options = null;

    }

    signRequest(message, secretKey){
        let encoded = Util.hmacsha256(message, secretKey);
        return encoded;
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

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-stanbicdstv");
                    

                    return this.notificationService != null;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error preparing registered notification services: ${err}`)

        }

        return false;

    }

    async sendNotification(customdata) {
        // let theMTIClass = this.notificationData.mti.substr(0, 2);

        let hasNotifiers = await this.prepareRegisteredNotificationServices();
        if(!hasNotifiers || this.notificationService == null)
            return false;

        const payload = customdata === null ? null : Object.assign({}, customdata);

        if(payload === null) {
            return false;
        }
        


        // const bankdetails = Util.getBankCodeAndBankName(this.notificationData.maskedPan);

        let theBody = {
            reference: customdata.reference,
            customerId: customdata.customerId,
            subscriptionType: customdata.subscriptionType,
            amount : (this.notificationData.amount/100),
            productCode: customdata.productCode,
            paymentDescription: "DSTV",
            payment: {
                status: this.notificationData.messageReason,
                rrn: this.notificationData.rrn,
                pan: this.notificationData.maskedPan,
                stan: this.notificationData.STAN,
                timestamp: this.notificationData.transactionTime,
                merchantID: this.notificationData.merchantId,
                merchantName: this.notificationData.merchantName,
                merchantAddress: this.notificationData.merchantName,
                TVR: customdata.tvr || "",
                TSI: customdata.TSI || "",
                CardholderName: customdata.CardholderName,
                AuthCode: this.notificationData.authCode || "",
                Expiry: this.notificationData.cardExpiry,
                Label: Util.getCardType(this.notificationData.maskedPan)
            }
        }

        
        let notificationHeaders = {
            'Content-Type': 'application/json',
            tid : this.notificationData.terminalId,
            token: process.env.STANBICDSTV_TOKEN
        }

        let notificationBody = JSON.stringify(theBody);

        console.log('notificationData', notificationBody);


        let requestOptions = {
            method: 'POST',
            headers: notificationHeaders,
            body: notificationBody
        };

        let notificationUrl = this.notificationService.url;

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        
        console.log(`Notification Service`, JSON.stringify(this.notificationService));
        
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out  ${this.notificationService.name} notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);



        return new Promise((resolve, reject) => {

            fetch(notificationUrl, requestOptions)
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({rrn: this.notificationData.rrn,
                        customerRef: this.notificationData.customerRef,
                        terminalId: this.notificationData.terminalId
                    },{$set : {notified : JSON.stringify(data), customData: customdata }},(err,data)=>{
                        if(err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(` ${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if(data.responseCode !== "000" || data.responseCode === undefined) {
                        
                        resolve(false)
    
                    }
    
                    resolve(data);

                }).catch((err) => {

                    Journal.updateOne({rrn: this.notificationData.rrn,
                        customerRef: this.notificationData.customerRef,
                        terminalId: this.notificationData.terminalId
                    },{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating  ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(` ${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    
                    resolve(false);

                });


            })
            .catch((err) => {

                Journal.updateOne({rrn: this.notificationData.rrn,
                    customerRef: this.notificationData.customerRef,
                    terminalId: this.notificationData.terminalId
                },{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

                resolve(false);

            });
    




        })


    }
}

module.exports = StanbicDstvNotifier;
