require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const moment = require('moment');

class PagaNotifier {

    constructor(notificationService, notificationData, options = {}) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;

    }

    signRequest(toHash, secret) {
    
       let hash = crypto.createHash('sha512');

        hash.update(toHash + secret);
         
        return hash.digest('hex');

    }

    sendNotification() {

        if(this.notificationData.responseCode != '00') return;
        
        let reversal = false;

        let notificationUrl = this.notificationService.url;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04") {

            notificationUrl = this.notificationService.reversalUrl;

            reversal = true;

        }

        let pan6 = this.notificationData.maskedPan.substr(0,6);
        let pan4 = this.notificationData.maskedPan.substr(this.notificationData.maskedPan.length - 5);
        let customerRef = this.notificationData.customerRef.split('~');
        let phone = customerRef.length > 1 ? customerRef[1] : "";

        let theBody = {
            amount : this.notificationData.amount,
            terminalId : this.notificationData.terminalId,
            referenceNumber : this.notificationData.rrn,
            datetimeUTC : moment(this.notificationData.transactionTime).format("YYYY-MM-DDTHH:mm:ss"),
            currency : "NGN",
            narration : "Card Debit",
            phoneNumber : phone,
            cardPANFirstSixDigits  : pan6,
            cardPANLastFourDigits : pan4,
            auditNumber : this.notificationData.authCode
        };

        if (reversal) {

            theBody = {
                referenceNumber: this.notificationData.rrn,
                reason: "timeout"
            };

        }


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let tohash = "";

        if(!reversal)
            tohash = `${this.notificationData.amount}${this.notificationData.terminalId}${this.notificationData.rrn}${moment(this.notificationData.transactionTime).format("YYYY-MM-DDTHH:mm:ss")}NGN`;
        else{
            tohash = this.notificationData.rrn;
        }

        let hash = this.signRequest(tohash,this.notificationService.key);

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'hash' : hash,
            'Authorization' : `Basic ${this.notificationService.authorizationToken}`

        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);


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
                            console.error(`error updating Paga notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Paga notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating Paga notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Paga notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Paga notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Paga notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = PagaNotifier;