require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const moment = require('moment');

class NownowNotifier {

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
        
        let reversal = false;

        let notificationUrl = this.notificationService.url;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        // let conf = Boolean(process.env.nownow_only_reversal) || true;

        let resCode = this.notificationData.responseCode;

        let rrr = "";
        let customerRef = this.notificationData.customerRef.split('~');
        if(customerRef.length > 1)
            rrr = customerRef[1];


        // if(conf == true && theMTIClass != "04" ){
        //     return;
        // }

        if (theMTIClass == "04") {

            reversal = true;
        }

        let theBody = {
            amount: this.notificationData.amount, 
            terminalId: this.notificationData.terminalId, 
            statusCode: resCode, 
            pan: this.notificationData.maskedPan, 
            rrn : this.notificationData.rrn, 
            reversal:reversal, 
            stan: this.notificationData.STAN, 
            bank: Util.bankfromTID(this.notificationData.terminalId), 
            transactionType : "nownow", 
            productId:"NOWNOW001", 
            referenceId : rrr,
            transactionTime: moment(this.notificationData.transactionTime).format("YYYY-MM-DD hh:mm:ss")
        };


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization' : `Bearer ${this.notificationService.authorizationToken}`

        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}, url : ${notificationUrl}`);
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
                            console.error(`error updating NowNow notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`NowNow notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating NowNow notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`NowNow notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating NowNow notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`NowNow notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = NownowNotifier;