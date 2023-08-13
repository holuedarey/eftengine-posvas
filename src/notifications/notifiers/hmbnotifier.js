require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const moment = require('moment');
const http = require('https');

class HSMNoitifer {

    constructor(notificationService, notificationData, options = {}) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;

    }

    signOnRequest(client_id, client_secret, authurl) {

        const authHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        const body = JSON.stringify({
            client_id,
            client_secret
        });

        return fetch(authurl, 
            {
                method: 'post',
                headers: authHeaders,
                body,
                agent: new http.Agent({
                    //pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                    //passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                    rejectUnauthorized: false
                })
            })
            .then((response) => {

                return response.json().then((data) => {

                    console.log(`Response from sign in for HSM notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from sign in HSM for notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    if (data.access_token !== undefined && data.access_token !== null) {

                        return data.access_token;


                    } else {

                        return false


                    }


                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating HSM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`HSM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                })
            })
            .catch((err) => {

                console.log(`There was an Error the doing a Sign in Request from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                return false;

            });
    }

    async sendNotification() {

        const reveral = false;

        const signInUrl = process.env.hsm_signin_url;


        if(!this.notificationData.customerRef)
        {
            console.error(`custom data not found to send notification; HSM Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`custom data not found to send notification; HSM Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }

        if(!(this.notificationData.responseCode == '00' && this.notificationData.MTI == '0200') )
          return false;

        const access_token = await this.signOnRequest(this.notificationService.parameters.client_id,
            this.notificationService.parameters.client_secret, signInUrl);

        if(!access_token) {
            return false;
        }

        const notificationHeaders = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${access_token}`,
            "TerminalID": this.notificationData.terminalId
        }

        const notificationUrl = this.notificationService.url;

        console.error(notificationHeaders)

        console.log(notificationUrl);

        const customerRef = this.notificationData.customerRef.split('~'); 

        const CustomerName = customerRef[1];

        const theBody = {
            Reference: this.notificationData.STAN,
            Amount: (this.notificationData.amount / 100),
            Currency: "566",
            Type: "Purchase",
            MaskedPAN: this.notificationData.maskedPan,
            CardScheme: Util.getCardType(this.notificationData.maskedPan),
            CustomerName,
            StatusCode: this.notificationData.responseCode,
            RetrievalReferenceNumber: this.notificationData.rrn,
            StatusDescription: this.notificationData.messageReason,
            PaymentDate: moment(this.notificationData.transactionTime).format("YYYY-MM-DD HH:mm:ss"),
            AdditionalInformation: [],
            TransactionReference: `${this.notificationData.terminalId}-${this.notificationData.rrn}-${Date.now()}`,
            Nuban: null
        }
        
        console.log(JSON.stringify(theBody));

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

                Journal.updateOne({rrn: this.notificationData.rrn,
                    customerRef: this.notificationData.customerRef,
                    terminalId: this.notificationData.terminalId
                },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                    if(err)
                        console.error(`error updating HSM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`HSM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                if (data.status === 1 && data.error === false) {

                } else {

                }

            }).catch((err) => {

                Journal.updateOne({rrn: this.notificationData.rrn,
                    customerRef: this.notificationData.customerRef,
                    terminalId: this.notificationData.terminalId
                },{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating HSM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`HSM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                return false;
            });


        }).catch((err) => {

            Journal.updateOne({rrn: this.notificationData.rrn,
                customerRef: this.notificationData.customerRef,
                terminalId: this.notificationData.terminalId
            },{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating HSM notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                console.log(`HSM notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            return false;
        })

    }
}

module.exports = HSMNoitifer;

