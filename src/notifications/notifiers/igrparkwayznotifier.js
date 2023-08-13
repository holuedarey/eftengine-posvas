const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');
const crypto = require('crypto');
require("dotenv").config();
const moment = require('moment');
const { resolve } = require('path');
const { rejects } = require('assert');


class IgrParkwayzNotifier {
    constructor(transactionData) {

        this.notificationData = transactionData;
        this.notificationService = null;
        this.options = null;

    }

    signRequest(message, secretKey){
        let encoded = Util.hmacsha256(message, secretKey);
        return encoded;
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



                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-igrparkwayz");

                    console.log(this.notificationService);

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
        // let theMTIClass = this.notificationData.mti.substr(0, 2);

        let hasNotifiers = await this.prepareRegisteredNotificationServices();
        if(!hasNotifiers || this.notificationService == null)
            return false;

        let customerRef = this.notificationData.customerRef;
        if(!customerRef)
        {
            console.error(`Customer Data not found to send notification; IGR-PARKWAY Zenith Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; IGR-PARKWAY Zenith Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }

        let CustmerDatas = customerRef.split("~");
        if(CustmerDatas.length < 2)
            return false;

        let invoiceNumber = CustmerDatas[1];
        

        // const bankdetails = Util.getBankCodeAndBankName(this.notificationData.maskedPan);

        
        let theBody = {
            InvoiceNumber: invoiceNumber,
            PaymentRef: this.notificationData.rrn,
            PaymentDate: `${moment(this.notificationData.transactionTime).format("DD/MM/YYYY HH:MM")}:00`,
            //BankCode: bankdetails.disburseBankCode || "000",
            //BankName: bankdetails.bank || "DEFAULT",
            AmountPaid: parseFloat(this.notificationData.amount/100).toFixed(2),
            TransactionDate: `${moment(this.notificationData.transactionTime).format("DD/MM/YYYY HH:MM")}:00`,
            Channel: 'POS',
            PaymentMethod: 'CARD',
            TransactionRefrence: this.notificationData.rrn,
            MaskedPAN: this.notificationData.maskedPan
        };

        // console.log('notificationData', theBody);

        //signature digest
        let toHash = theBody.InvoiceNumber + theBody.PaymentRef + theBody.AmountPaid + theBody.PaymentDate + theBody.Channel;
        let clientSecret = process.env.igr_parkway_zenith_clientsecret;
        let clientId = process.env.igr_parkway_zenith_clientid;

        let signatureHash = this.signRequest(toHash, clientSecret);

        //test
        let notificationHeaders = {
            'Content-Type': 'application/json',
            SIGNATURE : signatureHash,
            CLIENTID: clientId
        }

        let notificationBody = JSON.stringify(theBody);

        let requestOptions = {
            method: 'POST',
            headers: notificationHeaders,
            body: notificationBody
        };

        let notificationUrl = this.notificationService.url;

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out IGR-PARKWAY Zenith notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);


        return new Promise((resolve, reject) => {

            fetch(notificationUrl, requestOptions)
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating IGR-PARKWAY Zenith notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(` IGR-PARKWAY Zenith notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if(data.Error === true || data.Error === undefined) {
                        
                        resolve(false)
    
                    }
    
                    resolve(data);

                }).catch((err) => {

                    Journal.updateOne({_id : this.notificationData._id},{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating  IGR-PARKWAY Zenith notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(` IGR-PARKWAY Zenith notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    
                    resolve(false);

                });


            })
            .catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating IGR-PARKWAY Zenith notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`IGR-PARKWAY Zenith notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

                resolve(false);

            });
    


        })


    }
}

module.exports = IgrParkwayzNotifier;
