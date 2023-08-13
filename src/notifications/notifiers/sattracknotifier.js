require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');

class SattrackNotifier {

    constructor(notificationService, notificationData) {

        this.notificationService = notificationService;
        this.notificationData = notificationData;

    }

    sendNotification() {
        let reversal = 'false';

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        let notificationUrl = this.notificationService.url;

        if (theMTIClass == "04") {
            return false
        }
        let customerRef = this.notificationData.customerRef;
        let refs = customerRef.split('|');
        console.log("extra data Logging :: ", customerRef);

        let urlencoded = new URLSearchParams();
        urlencoded.append("plateNumber", refs[0].split('~')[1]);
        urlencoded.append("tranRef", this.notificationData.rrn);
        urlencoded.append("amount", this.notificationData.amount);
        urlencoded.append("authId", this.notificationData.authCode);
        urlencoded.append("cardHolderName", this.notificationData.merchantName);
        urlencoded.append("tranTime", Moment(this.notificationData.transactionTime).format('YYYY/MM/DD-h:mm:ss'),);
        urlencoded.append("fuelType", refs[4].split('~')[0]);
        urlencoded.append("unitPrice",refs[2]);
        urlencoded.append("quantity", refs[3]);
        urlencoded.append("odometer",refs[1]);
        urlencoded.append("cardPan", this.notificationData.maskedPan);
        urlencoded.append("status", "0");
        urlencoded.append("terminalId", this.notificationData.terminalId);

        let notificationHeaders = {
            'Accept': '*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
        };

        Util.fileDataLogger(this.notificationData.terminalId, "Notification Headers: " + JSON.stringify(notificationHeaders));

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${urlencoded}`);
        Util.fileDataLogger(this.notificationData.terminalId, `Sending out notification to ${this.notificationService.name}. Notification Body: ${urlencoded}`);

        // Util.isSattrackPOS();

        let url = notificationUrl;

        console.log(`Notification Url ${url}`);
        console.log(`Notification oject ${urlencoded}`);


        return fetch(url, {
            method: 'POST',
            headers: notificationHeaders,
            body: urlencoded,
            redirect: 'follow'
        })
            .then((response) => {

                response.json().then((data) => {

                    console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId, `Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

                    Journal.updateOne({ _id: this.notificationData._id }, { $set: { notified: JSON.stringify(data) } }, (err, data) => {
                        if (err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                }).catch((err) => {

                    Journal.updateOne({ _id: this.notificationData._id }, { $set: { notified: response.toString() } }, (err, data) => {
                        if (err)
                            console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                        else
                            console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId, `There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {

                Journal.updateOne({ _id: this.notificationData._id }, { $set: { notified: err.toString() } }, (err, data) => {
                    if (err)
                        console.error(`error updating ${this.notificationService.name} notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                        console.log(`${this.notificationService.name} notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId, `There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = SattrackNotifier;
