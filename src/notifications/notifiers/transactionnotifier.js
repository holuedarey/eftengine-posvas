require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const fs = require('fs');
const http = require('https');

class TransactionNotifier {

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

        if (theMTIClass == "04") {
            
            notificationUrl = this.notificationService.reversalUrl || this.notificationService.url;

            reversal = true;

        }
        
        let theBody = {
            MTI: this.notificationData.MTI,
            amount: this.notificationData.amount,
            terminalId: this.notificationData.terminalId,
            statusCode: this.notificationData.responseCode,
            PAN: this.notificationData.maskedPan,
            RRN: this.notificationData.rrn,
            STAN: this.notificationData.STAN,
            authCode: this.notificationData.authCode,
            type: null,
            product: null,
            bank: null,
            transactionTime: this.notificationData.transactionTime,
            reversal: reversal,
            transactionId: this.notificationData._id,
            originalTransaction: null,
            MID : this.notificationData.merchantId,
            merchantName: this.notificationData.merchantName,
            merchantAddress: this.notificationData.merchantAddress,
            MCC : this.notificationData.merchantCategoryCode
        };

        // get the identifiers
        const airlineIdentifier = process.env.airline_identifier;
        const crestviewCxr =process.env.crestview_cxr;
        const crestviewCmr =process.env.crestview_cmr;
        const bosvasIdentifier = process.env.bovas_identifier;
        const pfmCustomerRefId = process.env.pfmCustomerRefId;
         const kongaIdentifer = process.env.konga_identifier;
         const jumiaIdentifer = process.env.jumia_identifier;
        //////

        const customerRef = this.notificationData.customerRef;
        // add airline data
        if(customerRef.startsWith(airlineIdentifier)){
            let pnr = customerRef.split('|')[1];
            theBody.PNR = pnr;
        }
        // add crest CMR || CXR
        else if(customerRef.startsWith(crestviewCmr) || customerRef.startsWith(crestviewCxr)){
            let cmr = customerRef.split('|')[0];
            theBody.PNR = cmr;
        }
        // add bovas ref
        else if(customerRef.startsWith(bosvasIdentifier)){
            let ref = customerRef.split('|')[1];
            theBody.PNR = ref;
        }
        // for pfm notification with customerRef
        else if(customerRef.startsWith(pfmCustomerRefId)){
            let ref = customerRef.split('~')[1];
            theBody.PNR= ref;

        // for konga orderId
        } else if(customerRef.startsWith(kongaIdentifer)) {
            let ref = customerRef.split('~')[1].split('|')[0];
            theBody.PNR= ref;

        } else if(customerRef.startsWith(jumiaIdentifer)) {

            let ref = customerRef.split('~')[1].split('|')[0];
            theBody.PNR= ref;
        }
        // just pfm notification
        else{
            theBody.PNR = this.notificationData.rrn;
        }


        // let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'IISYS 74f230cc6cc96f7672aeb1f1745ccaec56de6e61f1d2ef2122441040ec58d044',
            'iisysgroup': '21155ded2430abf93108bef7a62cf2cca1bcf3c3ea8a75e6527a53409be495d0'

        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);


        fetch(notificationUrl, {

                method: 'POST',
                headers: notificationHeaders,
                agent: new http.Agent({
                    pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                    passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                    rejectUnauthorized: false
                }),
                body: notificationBody

            })
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {pfmNotified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating PFM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`PFM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {pfmNotified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating PFM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`PFM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response}`+response);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId},{$set : {pfmNotified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating PFM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`PFM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.error(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = TransactionNotifier;