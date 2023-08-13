require("dotenv").config();
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class TasshiNotifier {

    constructor(notificationService, notificationData) {
        this.notificationService = notificationService;
        this.notificationData = notificationData;
    }

    async sendNotification(){

        let reversal = 'false';

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        let notificationUrl = this.notificationService.url;

        if (theMTIClass == "04") {
            return false
        }

        if (this.notificationData.responseCode != '00') return;

        let customerRef = this.notificationData.customerRef;
        if(!customerRef)
        {
            console.error(`Customer Data not found to send notification; Tasshi Notification Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; Tasshi Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return;
        }
 
        let url = notificationUrl;
        console.log(`Notification Url ${url}`);

        let body = {
            MTI: this.notificationData.MTI,
            amount: this.notificationData.amount/100,
            terminalId: this.notificationData.terminalId,
            serialNumber: this.notificationData.ejournalData.serial,
            responseCode: this.notificationData.responseCode,
            responseDescription: this.notificationData.messageReason,
            PAN: this.notificationData.maskedPan,
            STAN: this.notificationData.STAN,
            authCode: this.notificationData.authCode,
            transactionTime: this.notificationData.transactionTime,
            reversal,
            merchantId: this.notificationData.merchantId,
            merchantName: this.notificationData.merchantName,
            merchantAddress: this.notificationData.merchantAddress,
            rrn: this.notificationData.rrn
        }  

        let notificationBody = JSON.stringify(body);
        let apiAuthorization = process.env.tasshi_api_key;
        let terminalId = this.notificationData.terminalId;

        let notificationHeaders = {
            "Accept":"application/json",
            "Content-Type":"application/json",
            'Authorization' : apiAuthorization,
            'TerminalId' : terminalId
        };

        console.log(`Preparing to Send ::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Preparing to Send:::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return fetch(
            url,
            {
            method: 'POST',
            headers: notificationHeaders,
            body: notificationBody,
         })
         .then((response) => {
            return response.json().then((data) => {

                console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                 
                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                    if(err)
                        console.error(`error updating Tasshi notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`Tasshi notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

            }).catch((err) => {
                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef,terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Tasshi notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`Tasshi notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                 });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
            
             });

         }).catch((err) => {
            Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef},{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating Tasshi notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                    console.log(`Tasshi notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
         
        });

    }

}

module.exports = TasshiNotifier;