require("dotenv").config();

const crypto = require('crypto');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

const { resolve } = require('path');
const { rejects } = require('assert');

class ElnexuNotifier {

    constructor(notificationService, notificationData) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;

    }

    async sendNotification() {

        let theMTIClass = this.notificationData.MTI.substr(0, 2);


        if(this.notificationData.responseCode != '00' && theMTIClass !== '02')
            return;

        
        let notificationUrl = this.notificationService.url;
        let theBody = {
            "MTI" : this.notificationData.MTI,
            "amount": (this.notificationData.amount/100),
            "terminalId": this.notificationData.terminalId,
            "responseCode": this.notificationData.responseCode,
            "responseDescription": this.notificationData.messageReason,
            "PAN": this.notificationData.maskedPan,
            "RRN": this.notificationData.rrn,
            "STAN": this.notificationData.STAN,
            "authCode": this.notificationData.authCode,
            "transactionTime": this.notificationData.transactionTime,
            "reversal": false,
            "merchantId": this.notificationData.merchantId,
            "merchantName": this.notificationData.merchantName,
            "merchantAddress": this.notificationData.merchantAddress
        };

        let notificationBody = JSON.stringify(theBody);

        let Authorization = process.env.elnexu_authorization;
        let notificationHeaders = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '+ Authorization,
            'terminalId': this.notificationData.terminalId
        };
        
        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return fetch(notificationUrl, {
                method: 'POST',
                headers: notificationHeaders,
                body: notificationBody
            })
            .then((response) => {

                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = ElnexuNotifier;