require("dotenv").config();
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

const fs = require('fs');
const http = require('https');

class CallhomeNotifier {

    constructor(notificationData, options = {}) {
        this.notificationData = notificationData;
        this.options = options;
    }

    async sendNotification() {

        let enabled = process.env.enable_callhome_notification == 'true' ? true : false;
        if(!enabled) return;

        let notificationUrl = process.env.callhome_notify_url;

        let stateInformation = null;

        try {
            stateInformation = JSON.parse(this.notificationData.stateInformation)
        } catch (error) {
            return;
        }

        let txn = await Journal.findOne({terminalId : this.notificationData.terminalId}).limit(1);
        if(!txn) return;

        let theBody = stateInformation;
        theBody.mid = txn.merchantId;

        let notificationBody = JSON.stringify(theBody);

        let notificationHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'IISYS 74f230cc6cc96f7672aeb1f1745ccaec56de6e61f1d2ef2122441040ec58d044',
            'iisysgroup': '21155ded2430abf93108bef7a62cf2cca1bcf3c3ea8a75e6527a53409be495d0'

        }

        console.log(`Sending out callhome data for ${this.notificationData.terminalId}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out callhome data for ${this.notificationData.terminalId}. Notification Body: ${notificationBody}`);
        


        fetch(notificationUrl, {

                method: 'POST',
                headers: notificationHeaders,
                agent: new http.Agent({
                    pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                    passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                    rejectUnauthorized: false
                }),
                body: notificationBody

            })
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from callhome notification TID ${this.notificationData.terminalId}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Response from callhome notification TID ${this.notificationData.terminalId}. Body: ${JSON.stringify(data)}`);
                    

                    if (data.status === 1 && data.error === false) {



                    } else {



                    }

                }).catch((err) => {

                    console.log(`There was an error processing the JSON response from callhome notification for of ${this.notificationData.terminalId}. Error: ${err}. The Response: ${response.toString()}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from callhome notification for of ${this.notificationData.terminalId}. Error: ${err}. The Response: ${response.toString()}`);
                    

                });


            })
            .catch((err) => {

                console.error(`There was an error sending callhome notification of ${this.notificationData.terminalId} Error: ${err}`);
                

            });

    }

}

module.exports = CallhomeNotifier;