require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class ETZNotifier {

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

        if((this.notificationData.responseCode != '00' && this.notificationData.MTI == '0200') || this.notificationData.MTI != '0200')
            return;


        let notificationUrl = this.notificationService.url;

        let customerRef = this.notificationData.customerRef.split('~');
        let customerName = customerRef[1];
        let serialNo = customerRef[2];


        let theBody = {

            ptspCode: this.notificationService.key,
            serialNo: serialNo,
            terminalId: this.notificationData.terminalId,
            rrn: this.notificationData.rrn,
            transactionType: "sPos",
            maskedPAN: this.notificationData.maskedPan,
            amount: (this.notificationData.amount/100),
            statusCode: this.notificationData.responseCode,
            statusDescription: this.notificationData.messageReason,
            transactionReference: (new Date().getTime()),
            customerName : customerName,
            paymentDate: require('moment-timezone')(this.notificationData.transactionTime).tz("Africa/Lagos").format("YYYY-MM-DD HH:mm:ss")
        };


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            "Authorization" : `Basic ${this.notificationService.authorizationToken}` //base64Encode of username:password

        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        let etTimeOut = Number(process.env.ETZ_TIMEOUT) || 180000;

        setTimeout(()=>{
            this.sendData(notificationUrl,notificationHeaders,notificationBody).then();
        },etTimeOut);

    }

    async sendData(notificationUrl,notificationHeaders,notificationBody){

        let reversal = await Journal.findOne({rrn : this.notificationData.rrn, terminalId : this.notificationData.terminalId,MTI : "0420" });
        if(reversal){
            if(reversal){
                return;
            }
        }

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
                        console.error(`error updating ETZ notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`ETZ notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                if (data.status === 1 && data.error === false) {



                } else {



                }

            }).catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating ETZ notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`ETZ notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

            });


        })
        .catch((err) => {

            Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating ETZ notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                console.log(`ETZ notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

        });
    }

}

module.exports = ETZNotifier;