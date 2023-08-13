require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');
const http = require('https');


class EBOXNoitifer {

    constructor(notificationService, notificationData, options = {}) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;

    }

    async sendNotification() {

        if(this.notificationData.responseCode != '00')
            return;

        let reversal = false;

        let notificationUrl = this.notificationService.url;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04") {
            notificationUrl = this.notificationService.reversalUrl;
            reversal = true;
        }

        const notificationHeaders = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": this.notificationService.authorizationToken
        }
        console.error(notificationHeaders)

        console.log(notificationUrl);

        const theBody = {
            MTI: this.notificationData.MTI,
            amount: (this.notificationData.amount/100),
            terminalId: this.notificationData.terminalId,
            responseCode: this.notificationData.responseCode,
            responseDescritption: this.notificationData.messageReason,
            PAN: this.notificationData.maskedPan,
            RRN: this.notificationData.rrn,
            STAN: this.notificationData.STAN,
            authCode: this.notificationData.authCode || "",
            transactionTime: this.notificationData.transactionTime,
            reversal,
            merchantId: this.notificationData.merchantId,
            merchantName: this.notificationData.merchantName,
            merchantAddress: this.notificationData.merchantAddress
        }
        
        console.log(JSON.stringify(theBody));

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${JSON.stringify(theBody)}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${JSON.stringify(theBody)}`);


        return fetch(notificationUrl, {
            method: 'post',
            headers: notificationHeaders,
            body: JSON.stringify(theBody),
            agent: new http.Agent({
                // pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                // passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                rejectUnauthorized: false
            })
        })
        .then((response) => {

            return response.json().then((data) => {

                console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                    if(err)
                        console.error(`error updating EBOX notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`EBOX notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                if (data.status === 1 && data.error === false) {

                } else {

                }

            }).catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating EBOX notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`EBOX notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                return false;
            });


        }).catch((err) => {

            Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating EBOX notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                console.log(`EBOX notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            return false;
        })

    }
}

module.exports = EBOXNoitifer;

