/**
 * @author Abolaji
 */
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');

class RemitaNotifier {
    constructor(transactionData) {

        this.notificationData = transactionData;
        this.notificationService = null;
    }

    async prepareRegisteredNotificationServices() {

        try {
            // get distinct notificationServices _Id for the TID or MID
            let theRegisteredNotifications = RegisteredNotification.find({
                $or: [{
                    merchantId: this.notificationData.merchantId
                }, {
                    terminalId: this.notificationData.terminalId
                },{
                    identifier: {$exists : true, $eq : Util.extractIdentifier(this.notificationData.customerRef)}
                }],
                $and: [{
                    enabled: true
                }]
            }).distinct('notificationService');

            let registeredNotifications = await theRegisteredNotifications.exec();

            // if TID or MID is regestered for notification
            if (registeredNotifications) {

                // get all the enabled noficationservices with their ID
                let theNotificationServices = NotificationService.find({
                    _id: {
                        $in: registeredNotifications
                    },
                    $and: [{
                        enabled: true
                    }]
                });

                let notificationServices = await theNotificationServices.exec();

                // console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-remita");

                    return this.notificationService != null;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error preparing registered notification services: ${err}`)

        }

        return false;

    }

    async sendNotification() {

        let hasNotifiers = await this.prepareRegisteredNotificationServices();

        if(!hasNotifiers || this.notificationService == null)
            return false;

        if(!this.notificationData.customerRef)
        {
            console.error(`RRR and product code not found to send notification; Remita Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`RRR and product code not found to send notification; Remita Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }
         

        if((this.notificationData.responseCode != '00' && this.notificationData.MTI == '0200') || this.notificationData.MTI != '0200')  
            return false;


        let notificationUrl = this.notificationService.url;

        let customerRef = this.notificationData.customerRef.split('~');
        let rrr = customerRef[1];
        let productCode = customerRef[2];

        if(Util.isSpecialUbaTID(this.notificationData.terminalId)){
            productCode = "CASHCONNECTUBA"
        }

        let notificationBody = {
            ProcessingInfo: [{
                name: "PRODUCTCODE",
                value : productCode
            }],
            amountDebited: Number(this.notificationData.amount/100)
        }

        console.log(JSON.stringify(notificationBody));

        notificationUrl = `${notificationUrl}/${this.notificationService.authorizationToken}/${this.notificationData.terminalId}/${rrr}/${this.notificationData.authCode || "123456"}/${this.notificationData.responseCode}/${this.notificationData.maskedPan}/${Util.getCardType(this.notificationData.maskedPan)}/${this.notificationData.rrn}/notification`
        console.log(notificationUrl);
        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        let etTimeOut = Number(process.env.Remita_TIMEOUT) || 180000;

        return fetch(notificationUrl, {

            method: 'post',
            headers: notificationHeaders,
            body : JSON.stringify(notificationBody)

        })
        .then((response) => {
            return response.text().then((response) => {
                console.log(`text response : ${response}`);

                let data = {};

                if(response.length){
                    try{
                        data = JSON.parse(response.substring(response.indexOf("{"),response.lastIndexOf("}")+1))
                    }catch(err){
                        console.log(`error, unableto parse response, ${err}`);
                        return false;
                    }
                }

                console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                    if(err)
                        console.error(`error updating Remita notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Remita notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                if (data.responseCode == "SUCCESS") {
                    return data;
                } else {
                    return false
                }

            }).catch((err) => {

                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Remita notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Remita notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                return false;
            });


        })
        .catch((err) => {

            Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId},{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating Remita notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                console.log(`Remita notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            return false;
        });


    }
}

module.exports = RemitaNotifier