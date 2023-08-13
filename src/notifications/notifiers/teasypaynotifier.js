require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

class TeasypayNotifier {

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

        let reversal = false;

        let notificationUrl = this.notificationService.url;

        // if(this.notificationData.responseCode != '00') return;

        let pan4 = this.notificationData.maskedPan.substr(this.notificationData.maskedPan.length - 4);

        let theBody = {
            mti: this.notificationData.MTI,
            apiUser : this.notificationService.authorizationToken,
            terminalID : this.notificationData.terminalId,
            lastCard4Digits : pan4,
            responseCode : this.notificationData.responseCode,
            RRN : this.notificationData.rrn,
            STAN : this.notificationData.STAN,
            timestamp : Moment(this.notificationData.transactionTime).format("DD-MM-YYYY HH:mm:ss"),
            amount : this.notificationData.amount,
            hash : ""
        }

        let toHash = theBody.terminalID + theBody.lastCard4Digits + theBody.responseCode + theBody.RRN + theBody.STAN + theBody.timestamp + theBody.amount;
       

        let hash = this.signRequest(toHash, this.notificationService.key);
    
        theBody.hash = hash;
        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json'
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
                            console.error(`error updating Teasy Pay notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Teasy Pay notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating Teasy Pay notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Teasy Pay notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Teasy Pay notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Teasy Pay notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = TeasypayNotifier;