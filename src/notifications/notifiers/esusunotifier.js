require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

//created by kayode shobalaje
class EsusuNotifier {

    constructor(notificationService, notificationData) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;

    }

    sendNotification() {
        if(this.notificationData.responseCode != '00')
            return;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04")
            return false;

        let notificationUrl = this.notificationService.url;

        let theBody = {
            "mti" : this.notificationData.MTI,
            "amount": (this.notificationData.amount/100),
            "terminalId": this.notificationData.terminalId,
            "responseCode": this.notificationData.responseCode,
            "responseDescription": this.notificationData.messageReason,
            "PAN": this.notificationData.maskedPan,
            "RRN": this.notificationData.rrn,
            "STAN": this.notificationData.STAN,
            "authCode": this.notificationData.authCode,
            "transactionTime": require('moment-timezone')(this.notificationData.transactionTime).tz("Africa/Lagos").format("YYYY-MM-DD HH:mm:ss"),
            "reversal": false,
            "merchantId": this.notificationData.merchantId,
            "merchantName": this.notificationData.merchantName,
            "merchantAddress": this.notificationData.merchantAddress
        };

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {
            'Content-Type': 'application/json',
        };

        console.log("Notification Headers:", notificationHeaders);
        
        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        fetch(notificationUrl, {
                method: 'POST',
                headers: notificationHeaders,
                body: notificationBody
            })
            .then((response) => {
                // console.log(response);

                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating Esusu notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Esusu notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating Esusu notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Esusu notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Esusu notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Esusu notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = EsusuNotifier;