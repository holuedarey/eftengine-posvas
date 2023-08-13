/**
 * @author Abolaji
 */

require("dotenv").config();

const crypto = require('crypto');
const cryptojs = require('crypto-js');
const https = require('https');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const RegisteredNotification = require('../../model/registerednotificationmodel');
const NotificationService = require('../../model/notificationservicemodel');
const Util = require('../../helpers/Util');

class SterlingNotifier {

    constructor(notificationData) {

        this.notificationService = null;
        this.notificationData = notificationData;
        this.isLive = process.env.frsc_str_live == 'true' ? true : false;

        this.userName = process.env.str_frsc_username;
        this.apiKey = process.env.str_frsc_api_key;
    }


    signRequest(data) {
    
        return cryptojs.SHA1(data).toString()

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

                console.log(`The Found Registered Notification Services ${notificationServices}`);

                // if notification services are returned
                if (notificationServices) {

                    this.notificationService = notificationServices.find(c => c.notificationClass == "manual-frsc-sterling");

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

        if (!hasNotifiers || this.notificationService == null)
            return false;

        // send notification for approved transactions only
        if (this.notificationData.responseCode != '00' || this.notificationData.MTI != '0200')
            return false;

        if (!this.notificationData.customerRef) {
            console.error(`customer data not found to send notification; STERLING Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            Util.fileDataLogger(this.notificationData.terminalId,`customer data not found to send notification; FRSC Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
            return false;
        }

        let notificationUrl = this.notificationService.url;

        let customerData = this.notificationData.customerRef.split("|");
        let transNumber = customerData[1];
        let cardHolder = customerData[2];
        let expiryDate = customerData[3];
        let cardType = customerData[4];

        let amount = this.notificationData.amount / 100.0;
        let toHash = `${require('moment')().format("YYYY-MM-DD")} ${transNumber} ${this.notificationData.terminalId} updateTransactionStatus ${this.apiKey}`;

        console.log(`to hash : ${toHash}`);

        let hashData = this.signRequest(toHash);
        

        console.log(`hash ${hashData}`);

        let theBody = {
            transNumber: transNumber,
            mposRefNumber: this.notificationData.rrn,
            NameOnCard: cardHolder,
            cardType: cardType,
            cardNumber: this.notificationData.maskedPan,
            amount: amount.toFixed(0),
            expiryDate: expiryDate,
            authCode: this.notificationData.authCode,
            message: "Approved",
            status: this.notificationData.responseCode,
        };

        let notificationBody = JSON.stringify(theBody);

        const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
          });


        let notificationHeaders = {

            'username': this.userName,
            'Content-Type': 'application/soap+xml',
            'terminalid': this.notificationData.terminalId,
            'password': hashData,
            agent: httpsAgent


        }

        console.log("notification headers: ", notificationHeaders);

        console.log("notification url: ", notificationUrl);

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        let reqBody = {

            method: 'post',
            headers: notificationHeaders
        }

        if(this.isLive)
            reqBody.body = `<soap:Envelope xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:pos=\"http://pos.npp.com/\">\r\n   <soap:Body>\r\n      <pos:updateTransactionStatus xmlns=\"http://pos.inv.com/\">\r\n         <transNumber xmlns=\"\">${theBody.transNumber}</transNumber>\r\n         <mposRefNumber xmlns=\"\">${theBody.mposRefNumber}</mposRefNumber>\r\n         <NameOnCard xmlns=\"\">${theBody.NameOnCard}</NameOnCard>\r\n         <cardType xmlns=\"\">${theBody.cardType}</cardType>\r\n         <cardNumber xmlns=\"\">${theBody.cardNumber}</cardNumber>\r\n         <amount xmlns=\"\">${theBody.amount}</amount>\r\n         <expiryDate xmlns=\"\">${theBody.expiryDate}</expiryDate>\r\n         <authCode xmlns=\"\">${theBody.authCode}</authCode>\r\n         <message xmlns=\"\">Approved or Completed Successfully</message>\r\n         <status xmlns=\"\">${theBody.status}</status>\r\n      </pos:updateTransactionStatus>\r\n   </soap:Body>\r\n</soap:Envelope>\r\n`;
        else
            reqBody.body = `<soap:Envelope xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:pos=\"http://pos.npp.com/\">\n   <soap:Body>\n      <pos:updateTransactionStatus xmlns=\"http://pos.inv.com/\">\n         <transNumber xmlns=\"\">${theBody.transNumber}</transNumber>\n         <mposRefNumber xmlns=\"\">${theBody.mposRefNumber}</mposRefNumber>\n         <NameOnCard xmlns=\"\">${theBody.NameOnCard}</NameOnCard>\n         <cardType xmlns=\"\">${theBody.cardType}</cardType>\n         <cardNumber xmlns=\"\">${theBody.cardNumber}</cardNumber>\n         <amount xmlns=\"\">${theBody.amount}</amount>\n         <expiryDate xmlns=\"\">${theBody.expiryDate}</expiryDate>\n         <authCode xmlns=\"\">${theBody.authCode}</authCode>\n         <message xmlns=\"\">Approved or Completed Successfully</message>\n         <status xmlns=\"\">${theBody.status}</status>\n      </pos:updateTransactionStatus>\n   </soap:Body>\n</soap:Envelope>\n`;

        return fetch(notificationUrl,reqBody )
            .then(res=> res.text())
            .then((response) => {

                // console.log(response);
                // console.log(response.toString());
                // console.log(Util.convertXMLtoJSON(response));

                try {
                    let jsonResponse = Util.convertXMLtoJSON(response);
                    let data = JSON.parse(jsonResponse);
                    let result = data['S:Envelope']["S:Body"]["ns2:updateTransactionStatusResponse"]["return"];
                    let status = result["status"]["_text"];

                    // console.log(JSON.stringify(result));
                    // console.log(`status: ${status}`);

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({
                        rrn: this.notificationData.rrn,
                        customerRef: this.notificationData.customerRef,
                        terminalId: this.notificationData.terminalId
                    }, {
                        $set: {
                            notified: JSON.stringify(data)
                        }
                    }, (err, data) => {
                        if (err)
                            console.error(`error updating STERLING notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`STERLING notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    if(status == '00'){
                        let transactionDataResponse = result['transactionDataResponse'];
                        let validationNumber = transactionDataResponse['validationNumber']['_text'];
                        return validationNumber;
                    }
                    else
                        return false;

                } catch (err) {
                    Journal.updateOne({
                        rrn: this.notificationData.rrn,
                        customerRef: this.notificationData.customerRef
                    }, {
                        $set: {
                            notified: err.toString()
                        }
                    }, (err, data) => {
                        if (err)
                            console.error(`error updating STERLING notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`STERLING notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                    return false;
                }
            })
            .catch((err) => {

                Journal.updateOne({
                    rrn: this.notificationData.rrn,
                    customerRef: this.notificationData.customerRef
                }, {
                    $set: {
                        notified: err.toString()
                    }
                }, (err, data) => {
                    if (err)
                        console.error(`error updating STERLING notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`STERLING notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                return false;

            });

    }

}

module.exports = SterlingNotifier;