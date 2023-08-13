/**
 * @author Abolaji
 */
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');

class RemitaCollectionNotifier {

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

                //console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-collect-remita");

                    return this.notificationService != null;

                }

            }

        } catch (err) {

            console.log(`There was an error preparing registered notification services: ${err}`)
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error preparing registered notification services: ${err}`)

        }

        return false;

    }

    async sendNotification(remittapayload = null) {
        
        let hasNotifiers = await this.prepareRegisteredNotificationServices();
        if(!hasNotifiers || this.notificationService == null)
            return false;

        if(!this.notificationData.customerRef)
        {
            console.error(`RRR and product code not found to send notification; Remita-Collection Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`RRR and product code not found to send notification; Remita-Collection Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }
         

        if((this.notificationData.responseCode != '00' && this.notificationData.MTI == '0200') || this.notificationData.MTI != '0200')
            return false;


        let notificationUrl = this.notificationService.url;

        let customerRef = this.notificationData.customerRef.split('~');
        
        const payload = remittapayload === null ? null : Object.assign({}, remittapayload);

        if(payload === null) {
            return true;
        }

        let notificationBody = {
            productCode: payload.productCode || null,
            rrr: payload.rrr,
            terminal : this.notificationData.terminalId,
            incomeAccount: "1234567890",
            debittedAccount: "0987654321",
            paymentAuthCode: this.notificationData.authCode || "",
            channel: "POS",
            paymentMethod: "card",
            payerName: payload.payerName,
            branchCode: "ITEX",
            amount: this.notificationData.amount.toString(),
            fundingSource: this.notificationService.key,
            transactionId: this.notificationData.rrn,
            chargeFee: payload.chargeFee,
            wallet: payload.walletId,
            pin : payload.pin,
            username: payload.username,
            password: payload.password,
            pfm : {
                state : {},
                journal: {
                    amount: this.notificationData.amount,
                    cardName: " Customer",
                    expiryDate: "NN/NN",
                    mPan: this.notificationData.maskedPan,
                    mcc: this.notificationData.merchantCategoryCode,
                    merchantName: this.notificationData.merchantName,
                    mid: this.notificationData.merchantId,
                    mti: this.notificationData.MTI,
                    ps: this.notificationData.processingCode,
                    rrn: this.notificationData.rrn,
                    stan: this.notificationData.STAN,
                    timestamp: this.notificationData.transactionTime,
                    vm: this.notificationData.onlinePin ? "OnlinePin":"OfflinePin",
                    rs : this.notificationData.responseCode,
                    acode  :  this.notificationData.authCode || ""
                }
            }
        }

        console.log(JSON.stringify(notificationBody));

        notificationUrl = `${notificationUrl}/vas/remita/rrr-payment`

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Vend-Type' : 'ITEX',
            'Username' : 'itex',
            'Authorization' : this.notificationService.authorizationToken
        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${JSON.stringify(notificationBody)}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return fetch(notificationUrl, {

            method: 'post',
            headers: notificationHeaders,
            body : JSON.stringify(notificationBody)

        })
        .then((response) => {
            return response.json().then((data) => {


                console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                Journal.updateOne({ rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId  },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                    if(err)
                        console.error(`error updating Remita-Collection notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Remita-Collection notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                if(data["responseCode"] == "00"){
                    return data;
                }
                return false;

            }).catch((err) => {

                Journal.updateOne({ rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Remita-Collection notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Remita-Collection notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                return false;
            });


        })
        .catch((err) => {

            Journal.updateOne({ rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId  },{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating Remita-Collection notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                console.log(`Remita-Collection notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            return false;
        });


    }
}

module.exports = RemitaCollectionNotifier;