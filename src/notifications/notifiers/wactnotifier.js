require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class WactNotifier {

    constructor(notificationService, notificationData, options = {}) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;

    }

    signRequest(requestBody, secret) {

        return Util.encryptAES(requestBody,secret,'hex')

    }

    sendNotification() {
        

        let notificationUrl = this.notificationService.url;

        // allow non-approved transaction send notifications for test
        if(!(this.notificationData.responseCode == '00' && this.notificationData.MTI == '0200') )
          return false;


        const customerRef = this.notificationData.customerRef.split("~");


        if(customerRef < 3) {
            return;
        }

        const invoiceNo = customerRef[1];

        const reference = customerRef[2];

        let theBody = {
            amount: `${(this.notificationData.amount/100)}`,
            currency: "NGN",
            invoiceNo,
            reference,
            payment:{
                status: this.notificationData.messageReason,
                rrn: this.notificationData.rrn,
                pan: this.notificationData.maskedPan,
                stan: this.notificationData.STAN,
                timestamp: this.notificationData.transactionTime,
                merchantID: this.notificationData.merchantId,
                merchantName: this.notificationData.merchantName,
            }
        };

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'env': 'LIVE',
            'tid': this.notificationData.terminalId
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
                            console.error(`error updating WACT notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`WACT notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating WACT notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`WACT notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    // Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating WACT notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`WACT notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                // console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                // Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = WactNotifier;