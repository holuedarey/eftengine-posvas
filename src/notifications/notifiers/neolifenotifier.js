/**
 * @author Abolaji
 */

require("dotenv").config();

const crypto = require('crypto');
const neolifeConfig = require('../../config/NeoLifeConfig.json');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class NeolifeNotifier {

    constructor(notificationService, notificationData, options = {}) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;
        this.isTest = process.env.neoTest || 'true';

    }

    signRequest(data) {

        let hash = crypto.createHash('sha512');

        hash.update(data);
         
        return hash.digest('hex');

    }

    sendNotification() {

        // send notification for approved transactions only
        if(this.notificationData.responseCode != '00')
            return;

        if(!this.notificationData.customerRef)
        {
            console.error(`customerId not found to send notification; Neolife Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`customerId not found to send notification; Neolife Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return;
        }
        
        let api_token = neolifeConfig.test_token;
        let terminalConfig = neolifeConfig.bank_token_config.find(c=>c.selector.includes(this.notificationData.terminalId.substr(0,4)));
        if(!terminalConfig && this.isTest == 'false')
        {
            console.error(`config not found to send notification; Neolife Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`config not found to send notification; Neolife Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return;
        }
        else if(terminalConfig.token == null && this.isTest == 'false')
        {
            console.error(`api_token not found to send notification; Neolife Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`api_token not found to send notification; Neolife Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return;
        }
        else if(terminalConfig.token && this.isTest == 'false')
        {
            api_token = terminalConfig.token;
        }

        let notificationUrl = this.notificationService.url;

        let customer = this.notificationData.customerRef.split("~")[1];
        let amount = this.notificationData.amount / 100.0;

        let toHash = api_token + this.notificationData.rrn + amount.toFixed(2);

        // console.log(`to hash : ${toHash}`);
        
        let hashData = this.signRequest(toHash);
        
        let theBody = {

               reference: this.notificationData.rrn,
               customerid: customer,
               date: require('moment')().format("YYYY-MM-DD HH:mm A"),
               amount: amount.toFixed(2),
               description: this.notificationData.terminalId,
               hash: hashData.toUpperCase()
        };

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api_token' : api_token

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
                            console.error(`error updating NEOLIFE notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`NEOLIFE notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });
                    

                    if (data.status == true || data.status == 'true') {

                    } else {



                    }

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating NEOLIFE notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`NEOLIFE notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating NEOLIFE notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`NEOLIFE notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = NeolifeNotifier;