require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

class CellulantNotifier {

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

        if(this.notificationData.responseCode != '00')
            return;

        let reversal = false;

        let notificationUrl = this.notificationService.url;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04") {

            notificationUrl = this.notificationService.reversalUrl;

            reversal = true;

        }

        let customerName = "";
        let customerRef = this.notificationData.customerRef;
        let refs = customerRef.split('~');
        if(refs.length > 1)
            customerName = refs[1];

        let theBody = {
            Reference: this.notificationData.rrn,
            Amount : (this.notificationData.amount/100),
            Currency: "NGN",
            Type: "invoice",
            TransactionReference: this.notificationData.rrn + this.notificationData.terminalId,
            MaskedPAN: this.notificationData.maskedPan,
            CardScheme: Util.getCardType(this.notificationData.maskedPan),
            CustomerName: customerName,
            StatusCode: this.notificationData.responseCode,
            RetrievalReferenceNumber: this.notificationData.rrn,
            StatusDescription: this.notificationData.messageReason,
            PaymentDate: Moment(this.notificationData.transactionTime).format("YYYY-MM-DD")
        };

        if(reversal){
            theBody = {
                RetrievalReferenceNumber: this.notificationData.rrn,
                Reference: this.notificationData.rrn,
                Amount: (this.notificationData.amount/100),
                Currency: "NGN",
                TransactionReference: this.notificationData.rrn + this.notificationData.terminalId,
                PaymentDate: Moment(this.notificationData.transactionTime).format("YYYY-MM-DD")
            }
        }


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);
        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization' : `Basic ${Buffer.from(this.notificationService.authorizationToken, 'utf-8').toString('base64')}`,
            'TerminalID' : this.notificationData.terminalId
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
                            console.error(`error updating Cellulant notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Cellulant notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    // if (data.status === 1 && data.error === false) {



                    // } else {



                    // }

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating Cellulant notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Cellulant notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Cellulant notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Cellulant notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = CellulantNotifier;