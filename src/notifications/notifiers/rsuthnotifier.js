/**
 * @author Abolaji
 */
require("dotenv").config();

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');

class RsuthNotifier {

    constructor(notificationData) {

        this.notificationService = null;
        this.notificationData = notificationData;
    }

    async prepareRegisteredNotificationServices() {

        try {
            // get distinct notificationServices _Id for the TID or MID
            let theRegisteredNotifications = RegisteredNotification.find({
                $or: [{
                    merchantId: this.notificationData.merchantId
                }, {
                    terminalId: this.notificationData.terminalId
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

                //console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-rsuth");

                    return this.notificationService != null;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error preparing registered notification services: ${err}`)
            return false;
        }

        return false;

    }

    async sendNotification() {

        let hasNotifiers = await this.prepareRegisteredNotificationServices();

        if(!hasNotifiers || this.notificationService == null)
            return false;
        
        if (this.notificationData.MTI != "0200") {
            return false;   
        }

        if(!this.notificationData.customerRef)
        {
            console.error(`Patient ID not found to send notification; RSUTH Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Patient ID not found to send notification; RSUTH Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }

        let notificationUrl = this.notificationService.url;

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json'

        }
        Util.fileDataLogger(this.notificationData.terminalId,`Journal data ${JSON.stringify(this.notificationData)}.`);        
        console.log(`Sending out notification to ${this.notificationService.name}.`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}.`);

        let customerRef = this.notificationData.customerRef.split('~');
        let patientID = customerRef[1];
        let theBody = JSON.stringify({
            terminalId: this.notificationData.terminalId,
            API_KEY: this.notificationService.key,
            amount: (this.notificationData.amount/100),
            statusCode: this.notificationData.responseCode,
            PAN: this.notificationData.maskedPan,
            RRN: this.notificationData.rrn,
            STAN: this.notificationData.STAN,
            transactionType: "",
            productId: "RUTH",
            bank: "",
            transactionTime: this.notificationData.transactionTime,
            reversal: false,
        });
        
        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${JSON.stringify(theBody)}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${JSON.stringify(theBody)}`);

        return fetch(`${notificationUrl}/api/${this.notificationData.merchantId}/v1/order/${patientID}/acquire/${this.notificationData.rrn}`, {
                
                method: 'post',
                headers: notificationHeaders,
                body : theBody

            })
            .then((response) => {

                return response.json().then((res) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(res)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(res)}`);

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(res)}},(err,data)=>{
                        if(err)
                            console.error(`error updating Rsuth notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Rsuth notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if (res.status == 'success' && res.data.responsecode == '00') {
                        return true;
                    } else {
                        return {
                            success : false,
                            message : res.data.responsemessage
                        };
                    }

                }).catch((err) => {

                    try {
                        Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(response.toString())}},(err,data)=>{
                            if(err)
                                console.error(`error updating Rsuth notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                            else
                            console.log(`Rsuth notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        });
                    } catch (error) {
                        Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                            if(err)
                                console.error(`error updating Rsuth notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                            else
                            console.log(`Rsuth notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        });
                    }

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    return false;
                });


            })
            .catch((err) => {

                try {
                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId},{$set : {notified : JSON.stringify(err.toString())}},(err,data)=>{
                        if(err)
                            console.error(`error updating Rsuth notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Rsuth notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });
                } catch (error) {
                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId},{$set : {notified : err.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating Rsuth notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`Rsuth notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });
                }

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                return false;
            });

    }

}

module.exports = RsuthNotifier;