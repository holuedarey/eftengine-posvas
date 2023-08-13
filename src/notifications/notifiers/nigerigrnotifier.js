/**
 * @author Adeyemi Adesola
 * @company Itex_integrated_services
 * 
 */
 const fetch = require('node-fetch');
 const Journal = require('../../model/journalmodel');
 const Util = require('../../helpers/Util');
 const Moment = require('moment');
 
 class NigerIgrNotifier {

    constructor(notificationService, notificationData, options = {}) {
        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;
    }

    async generateToken() {
        try{
            let plainCredentials = process.env.NIGER_IGR_USERNAME + ":" + process.env.NIGER_IGR_PASSWORD;
            let base64Credentials = Buffer.from(plainCredentials, 'binary').toString('base64');
            let theBody = { grant_type: 'client_credentials' };

            return fetch(`${process.env.NIGER_IGR_TOKEN_BASE_URL}`,{
                method: 'POST',
                headers : {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization : `Basic ${base64Credentials}`,
                    },
                    body: this.encodeRequestBody(theBody)
                })
                .then((response) => {
                    return response.json()
                    .then((res) => {
                        if(res.error){
                            return false;
                        }
                        return res.access_token;
                    })
                    .catch((err) => {
                        console.error(`Error fetching token info from host`);
                        console.log(err.message);
                        return false;
                    });
                }).catch(err => {
                    console.error(`Error fetching response info from host`);
                    console.log(err.message);
                    return false;
                });
        }catch(err){
            console.error(`Error fetching token info from host`);
            console.log(err.message);
            return false;
        }

    }

    encodeRequestBody(details){
        const formBody = Object.keys(details).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(details[key])).join('&');
        return formBody;
    }

    async sendNotification() {
 
        console.log('did we enter send notification for nigerigr??');
        
        if (this.notificationData.responseCode != '00') return;
        
        let customerRef = this.notificationData.customerRef;
        if(!customerRef)
        {
            console.error(`Customer Data not found to send notification; IGR Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; IGR Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return;
        }
        
        const token = await this.generateToken();
        if(!token) return;
        let notificationUrl = this.notificationService.url;

        let invoiceNumber = "";
        let refs = customerRef.split('~');
        if(refs.length > 1) {
            invoiceNumber = refs[1];
        }

        let theBody = {
            invoiceNumber: invoiceNumber,
            paymentReference: this.notificationData.rrn,
            paymentDate: Moment(this.notificationData.transactionTime).format('YYYY-MM-DD h:mm:ss a'),
            amountPaid: Number((this.notificationData.amount/100).toFixed(2)),
            paymentStatus: "Paid"
        };
        let notificationBody = JSON.stringify(theBody);
        
        let notificationHeaders = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        };

        console.log(`Preparing to Send ::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Preparing to Send:::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return fetch(notificationUrl, {
                method: 'POST',
                headers: notificationHeaders,
                body: notificationBody,
             })
             .then((response) => {
 
                return response.json().then((data) => {
 
                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                     
                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating Niger IGR notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`Niger IGR notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                }).catch((err) => {
                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef,terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating Niger IGR notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`Niger IGR notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                     });
 
                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    // return false;
                 });

             }).catch((err) => {
                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Niger IGR notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`Niger IGR notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                // return false;
            });

    }
}
 
 module.exports = NigerIgrNotifier