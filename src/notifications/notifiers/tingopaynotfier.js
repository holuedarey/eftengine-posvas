require("dotenv").config();
const crypto = require('crypto');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');
const convert2XML = require('jsontoxml');
const converter = require('xml-js');

class TingoPayNotifier {

    constructor(notificationService, notificationData) {
        this.notificationService = notificationService;
        this.notificationData = notificationData;
    }

    async sendNotification(){

        // let reversal = 'false';

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        let notificationUrl = this.notificationService.url;

        if (theMTIClass == "04") {
            return false;
        }

        if (this.notificationData.responseCode != '00') return;

        let customerRef = this.notificationData.customerRef;
        if(!customerRef)
        {
            console.error(`Customer Data not found to send notification; TingoPay Notification Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; TingoPay Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return;
        }

        let url = notificationUrl;
        console.log(`Notification Url ${url}`);

        let refs =  this.notificationData.customerRef.split('~');
        console.log('REFS::::', refs);

        if (refs[0] !== "tingopay") {
            return;
        }

        // let customerData = this.notificationData.customerRef.split("|");

        let responseTime = Date.parse(this.notificationData.handlerResponseTime);
        let transTime = Date.parse(this.notificationData.transactionTime);

        let duration = Number.parseFloat((((responseTime - transTime) / 1000).toFixed(2)));

        let body = {
            "BankName": Util.bankfromTID(this.notificationData.terminalId),
            "PAN": this.notificationData.maskedPan,
            "TerminalID": this.notificationData.terminalId,
            "TransactionType": this.notificationData.transactionType,
            "STAN": this.notificationData.STAN,
            "Amount": this.notificationData.amount/100,
            "CardType": Util.getCardType(this.notificationData.maskedPan),
            "ExpiryDate": this.notificationData.cardExpiry,
            "ResponseCode": this.notificationData.responseCode,
            "RetrievalReferenceNumber": this.notificationData.rrn,
            "AppName": "ITEX v1.0.0",
            "PTSP": "ITEX",
            "MerchantDetails": this.notificationData.merchantName,
            "MerchantID": this.notificationData.merchantId,
            "Card Holder": this.notificationData.cardName,
            "DateTime": Moment(this.notificationData.transactionTime).format('YYYY-MM-DD h:mm:ss a'),
            "Duration": duration,
        };

        let notificationBody = JSON.stringify(body);

        let notificationHeaders = {
            "Accept":"application/json",
            "Content-Type":"application/json"
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
                        console.error(`error updating TingoPay notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`TingoPay notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

            }).catch((err) => {
                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef,terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating TingoPay notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`TingoPay notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                 });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                // return false;
             });

         }).catch((err) => {
            Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef},{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating TingoPay notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                    console.log(`TingoPay notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            // return false;
        });

    }

}

module.exports = TingoPayNotifier;