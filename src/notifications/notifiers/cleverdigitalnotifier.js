require("dotenv").config();

const crypto = require('crypto-js');
// const { createHmac } = await import('crypto');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

class cleverdigitalNotifier {

    constructor(notificationService, notificationData) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;

    }

// Add “x-clever-auth” to the header and the value should be the base64 hmac256 encoding of the 
// plain text.
// Plain text = terminalID + amount + merchantID + rrn + stan + responseCode
// N.B - the plain text is the 

    signRequest(value) {

        return crypto.HmacSHA256(value, process.env.CLEVER_DIGI_KEY).toString(crypto.enc.Base64);
  
    }
    
    async sendNotification() {
        let reversal = 'false';

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if(this.notificationData.responseCode != '00')
            return;

        let notificationUrl = this.notificationService.url;
        if (theMTIClass == "04"){
            return false
        }


        let theBody = {
            MTI: this.notificationData.MTI || '0200',
            amount: (this.notificationData.amount/ 100).toFixed(2),
            terminalId: this.notificationData.terminalId,
            responseCode: this.notificationData.responseCode,
            responseDescription:this.notificationData.messageReason,
            PAN: this.notificationData.maskedPan,
            STAN: this.notificationData.STAN,
            authCode: this.notificationData.authCode,
            transactionTime: this.notificationData.transactionTime['$date'],
            reversal: reversal,
            merchantId: this.notificationData.merchantId,
            merchantName: this.notificationData.merchantName,
            merchantAddress: this.notificationData.merchantAddress,
            rrn: this.notificationData.rrn,
        };

        let notificationBody = JSON.stringify(theBody);
        let plainText = `${theBody.terminalId}${(this.notificationData.amount/ 100).toFixed(2)}${theBody.merchantId}${theBody.rrn}${theBody.STAN}${theBody.responseCode}`


        let signature = this.signRequest(plainText);

        Util.fileDataLogger(this.notificationData.terminalId, "Notification plainText Headers: "+ plainText);
        Util.fileDataLogger(this.notificationData.terminalId, "Notification signature Headers: "+ signature);

   
        let notificationHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'x-clever-auth' : signature
        };

        Util.fileDataLogger(this.notificationData.terminalId, "Notification Headers: "+ JSON.stringify(notificationHeaders));
        
        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        fetch(notificationUrl, {
                method: 'POST',
                headers : notificationHeaders,
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

module.exports =   cleverdigitalNotifier;
