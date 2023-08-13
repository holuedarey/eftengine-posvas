/**
 * @author Abolaji
 */
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');
const crypto = require('crypto');

class IgrNotifier {
    constructor(transactionData) {

        this.notificationData = transactionData;
        this.notificationService = null;
    }


    signRequest(toHash, secret) {
    
        let hash = crypto.createHash('sha512');
 
         hash.update(toHash + secret);
          
         return hash.digest('hex');
 
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

                    this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-igr");

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

        let customerRef = this.notificationData.customerRef;
        if(!customerRef)
        {
            console.error(`Customer Data not found to send notification; IGR Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; IGR Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }
         

        let notificationUrl = this.notificationService.url;

        let CustmerDatas = customerRef.split("~");
        if(!CustmerDatas.length)
            return false;

        let strCustmerData = CustmerDatas[1];

        let custmerData = null;
        try{
            custmerData = JSON.parse(strCustmerData);
        }catch(error){
            return false;
        }

        
        let theBody = {
            actualAmount : this.notificationData.amount,

            creditBankAccountNumber : custmerData.crNo.toString(),
            debitBankAccountNumber : custmerData.dbNo,
            debitBankAccountName : custmerData.dbNm,
            uniqueDepositReference : custmerData.depRef,
            bankUniqueReference : custmerData.bankRef,
            cbnCode : custmerData.cbnCode,
            expectedDate : custmerData.exD,
            expectedAmount : custmerData.exAmt,

            minAmount : custmerData.minAmount,
            terminalId : this.notificationData.terminalId,
            rrn : this.notificationData.rrn,
            stan : this.notificationData.STAN,
            authId : this.notificationData.authCode,
            pan : this.notificationData.maskedPan,
            respCode : this.notificationData.responseCode
        };

        let toHash = theBody.rrn + theBody.uniqueDepositReference + theBody.actualAmount;
        let hash = this.signRequest(toHash, this.notificationService.key);

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Signature' : hash
        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);


        return fetch(notificationUrl, {

                method: 'post',
                headers: notificationHeaders,
                body: notificationBody

            })
            .then((response) => {

                return response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(data)}},(err,data)=>{
                        if(err)
                            console.error(`error updating IGR notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`IGR notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });
                    
                    // let responseData = JSON.parse(data);
                    // console.log(JSON.stringify(responseData));
                    if (data.status == '00' ) {
                        return true;
                    } else {
                        return false;
                    }

                }).catch((err) => {

                    Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef,terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                        if(err)
                            console.error(`error updating IGR notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                        console.log(`IGR notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    return false;
                });


            })
            .catch((err) => {

                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating IGR notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`IGR notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                return false;

            });

    }
}

module.exports = IgrNotifier