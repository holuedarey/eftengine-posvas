require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const fs = require('fs');
const http = require('https');

class StanbicNotifier {

    constructor(notificationService, notificationData, options = {}) {

        this.notificationService = notificationService;
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

    sendNotification() {


        let notificationUrl = this.notificationService.url;

        let theBody = {
            terminal_id: this.notificationData.terminalId,
            merchant_id: this.notificationData.merchantId,
            rrn: this.notificationData.rrn,
            mti : this.notificationData.MTI,
            stan: this.notificationData.STAN,
            pan: this.notificationData.maskedPan,
            auth_code: this.notificationData.authCode,
            response_code: this.notificationData.responseCode,
            response_msg: this.notificationData.messageReason,
            amount: this.notificationData.amount,
            transaction_date: this.notificationData.transactionTime
        };


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization' : this.notificationService.authorizationToken
        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);


        fetch(notificationUrl, {

            method: 'post',
            headers: notificationHeaders,
            body: notificationBody,
            agent: new http.Agent({
                pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                rejectUnauthorized: false
            })

        })
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating STANBIC notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`STANBIC notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating STANBIC notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`STANBIC notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating STANBIC notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`STANBIC notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = StanbicNotifier;