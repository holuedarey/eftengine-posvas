require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');

const TransactionNotifier = require("./transactionnotifier");
const Util = require('../../helpers/Util');

class PFMExternalNotifier extends TransactionNotifier {

    constructor(notificationService, notificationData, options = {}) {

        super(notificationService, notificationData, options);

    }

    signRequest(requestBody, secret) {

        let amount = requestBody.amount || '';
        let reversal = (requestBody.reversal ? 'true': 'false');
        let rrn = requestBody.rrn || '';
        let stan = requestBody.stan || '';

        let theData = amount + reversal + rrn + stan + secret;

        let base64Encoded = Buffer.from(theData).toString('base64');

        let hash = crypto.createHash('sha512');

        hash.update(base64Encoded);
         
        return hash.digest('hex');
    }

    sendNotification(notificationService) {

        let reversal = false;

        let notificationUrl = this.notificationService.url;

        let theMTIClass = this.notificationData.MTI.substr(0, 2);

        if (theMTIClass == "04" && this.notificationService.reversalUrl !== null && this.notificationService.reversalUrl !== undefined) {

            notificationUrl = this.notificationService.reversalUrl;

            reversal = true;

        }

        let theBody = {

            mti: this.notificationData.MTI,
            amount: this.notificationData.amount,
            terminalId: this.notificationData.terminalId,
            statusCode: this.notificationData.responseCode,
            pan: this.notificationData.maskedPan,
            rrn: this.notificationData.rrn,
            reversal: reversal,
            stan: this.notificationData.STAN,
            bank: "",
            authCode: this.notificationData.authCode,
            transactionType: this.notificationService.name,
            productId: this.notificationService.name,
            transactionTime: this.notificationData.transactionTime,
            transactionId: this.notificationData._id

        };

        let signature = this.signRequest(theBody, this.notificationService.key || '');

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.notificationService.authorizationToken,
            'ITEX-Signature': signature

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

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);

                });

            })
            .catch((err) => {

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);

            });

    }

}

module.exports = PFMExternalNotifier;