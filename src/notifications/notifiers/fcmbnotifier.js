require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');
const axios = require('axios')
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const moment = require('moment');
const convert2XML = require('jsontoxml');
const converter = require('xml-js');
const http = require('https');
const fs = require('fs');

class FcmbNotifier {
  constructor(notificationService, notificationData, options = {}) {
    this.notificationService = notificationService;
    this.notificationData = notificationData;
    this.options = options;
  }

  sendNotification() {
    console.log(
      'Sending Notification  data ==> ',
      JSON.stringify(this.notificationData)
    );

    // console.log("Sending Notification service db data ==> ", this.notificationService)

    let reversal = false;
      console.log("%%%%%%%%%%%%%%%%%%%%%",this.notificationService.url);
    let notificationUrl = this.notificationService.url;

    let customData = this.notificationData.ejournalData;

    // console.log("Custom data ==> ", customData)

    if (customData === {} || customData === null) {
      return false;
    }

    // let expiry = customData.expiry !== undefined ? customData.expiry.replace("/", "") : "";

    let theMTIClass = this.notificationData.MTI.substr(0, 2);

    if (theMTIClass == '04') {
      reversal = true;
      return false;
    }

    let requestBody = {
      STAN: this.notificationData.STAN,
      transactionType: this.notificationData.transactionType,
      transactionDate: moment(this.notificationData.transactionTime).format(
        'YYYY-MM-DD h:mm:ss a'
      ),
      responseCode: this.notificationData.responseCode,
      terminalId: this.notificationData.terminalId,
      pan: this.notificationData.maskedPan,
      amount: this.notificationData.amount / 100,
      cardExpiry: this.notificationData.cardExpiry || "null",
      retrievalReferenceNumber: this.notificationData.rrn,
      authCode: this.notificationData.authCode,
      merchantDetails: {
        merchantCode: this.notificationData.merchantCode || 'null',
        merchantDetails: {
          merchantName: this.notificationData.merchantName,
          merchantId: this.notificationData.merchantId,
          merchantAddress: this.notificationData.merchantAddress,
        },
      },
      echoData: this.notificationData.echoData || 'null',
      callbackUrl: this.notificationService.url,
      reversal: false,
    };

    const authCredentials = process.env.FCMB_USERNAME + ':' + process.env.FCMB_PASSWORD;
    const encodedToken = Buffer.from(authCredentials).toString('base64');

    let notificationBody = JSON.stringify(requestBody);
    var config = {
      method: 'post',
      url: notificationUrl,
      headers: { Authorization: 'Basic ' + encodedToken },
      data: requestBody,
    };

    console.log(
      `Preparing to Send ::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`
    );

    Util.fileDataLogger(
      this.notificationData.terminalId,
      `Preparing to Send:::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`
    );

    return axios(config)
      .then((response) => {
        const data = response.data
            console.log(
              `Response from notification of ${
                this.notificationData._id
              } from ${this.notificationService.name}. Body: ${JSON.stringify(
                data
              )}`
            );
            Util.fileDataLogger(
              this.notificationData.terminalId,
              `Response from notification of ${
                this.notificationData._id
              } from ${this.notificationService.name}. Body: ${JSON.stringify(
                data
              )}`
            );

            Journal.updateOne(
              { _id: this.notificationData._id },
              { $set: { notified: JSON.stringify(data) } },
              (err, data) => {
                if (err)
                  console.error(
                    `error updating Polaris notification result on journal at ${new Date().toString()} RRN : ${
                      this.notificationData.rrn
                    }`
                  );
                else
                  console.log(
                    `Fcmb notification result updated successfully at ${new Date().toString()} RRN : ${
                      this.notificationData.rrn
                    }`
                  );
              }
            );
            return false;
          })
      .catch((err) => {
        Journal.updateOne(
          {
            rrn: this.notificationData.rrn,
            customerRef: this.notificationData.customerRef,
          },
          { $set: { notified: err.toString() } },
          (err, data) => {
            if (err)
              console.error(
                `error updating FCMB notification result on journal at ${new Date().toString()} RRN : ${
                  this.notificationData.rrn
                }`
              );
            else
              console.log(
                `FCMB notification result updated successfully at ${new Date().toString()} RRN : ${
                  this.notificationData.rrn
                }`
              );
          }
        );

        console.log(
          `There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`
        );
        Util.fileDataLogger(
          this.notificationData.terminalId,
          `There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`
        );
        // return false;
      });
  }
}

module.exports = FcmbNotifier;
