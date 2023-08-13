require("dotenv").config();

const crypto = require("crypto");
const moment = require("moment");
const fetch = require("node-fetch");
const Journal = require("../../model/journalmodel");
const Util = require("../../helpers/Util");
const fs = require("fs");
const http = require("https");
const { getMaxListeners } = require("../../model/journalmodel");


class UbaNotifier {
  constructor(notificationService, notificationData, options = {}) {
    this.notificationService = notificationService;
    this.notificationData = notificationData;
    this.options = options;
  }

  sendNotification() {

    console.log("Sending Notification  data ==> ", JSON.stringify(this.notificationData));

    console.log("Sending Notification service db data ==> ", this.notificationService)

    let reversal = false;

    let notificationUrl = this.notificationService.url;

    let customData = this.notificationData.ejournalData;

    console.log("Custom data ==> ", customData)

    if (customData === {} || customData === null) {
        return;
    }

    let expiry = customData.expiry !== undefined ? customData.expiry.replace("/", "") : "";

    let theMTIClass = this.notificationData.MTI.substr(0, 2);

    if (theMTIClass == "04") {
        reversal = true;
    }

    
    let requestBody = {
      tran_date: moment(this.notificationData.transactionTime).format("YYYY-MM-DD HH:mm:ss"),
      terminal_ID: this.notificationData.terminalId,
      merchant_ID: this.notificationData.merchantId,
      first_six_pan: this.notificationData.maskedPan.substring(0, 6),
      last_four_pan: this.notificationData.maskedPan.substring(this.notificationData.maskedPan.length - 4),
      expiry: this.notificationData.ejournalData.expiry !== undefined ? this.notificationData.ejournalData.expiry.replace("/", "") : "" ,
      acct_name: this.notificationData.ejournalData.card_holder_name,
      stan: this.notificationData.STAN,
      rrn: this.notificationData.rrn,
      // seq_no: "234569",
      // batch_no: "0045",
      auth_ID: this.notificationData.authCode,
      account_type: Util.getFromAccount(this.notificationData.processingCode).toUpperCase(),
      amount: parseFloat(this.notificationData.amount.toString() / 100).toFixed(2),
      tran_status: this.notificationData.messageReason,
      tran_status_code: this.notificationData.responseCode,
      card: Util.getCardType(this.notificationData.maskedPan),
      aid: this.notificationData.ejournalData.aid,
      tsi: this.notificationData.ejournalData.tsi,
      tvr: this.notificationData.TVR,
    };

    let notificationBody = JSON.stringify(requestBody);

    let notificationHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}, url : ${notificationUrl}`);
    Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

    fetch(notificationUrl, {
      method: "post",
      headers: notificationHeaders,
      body: notificationBody,
    })
      .then((response) => {
        response
          .json()
          .then((data) => {
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
                    `error updating UBA notification result on journal at ${new Date().toString()} RRN : ${
                      this.notificationData.rrn
                    }`
                  );
                else
                  console.log(
                    `UBA notification result updated successfully at ${new Date().toString()} RRN : ${
                      this.notificationData.rrn
                    }`
                  );
              }
            );

            if (data.status === 1 && data.error === false) {
            } else {
            }
          })
          .catch((err) => {
            Journal.updateOne(
              { _id: this.notificationData._id },
              { $set: { notified: response.toString() } },
              (err, data) => {
                if (err)
                  console.error(
                    `error updating UBA notification result on journal at ${new Date().toString()} RRN : ${
                      this.notificationData.rrn
                    }`
                  );
                else
                  console.log(
                    `UBA notification result updated successfully at ${new Date().toString()} RRN : ${
                      this.notificationData.rrn
                    }`
                  );
              }
            );

            console.log(
              `There was an error processing the JSON response from ${
                this.notificationService.name
              } for of ${
                this.notificationData._id
              }. Error: ${err}. The Response: ${response.toString()}`
            );
            Util.fileDataLogger(
              this.notificationData.terminalId,
              `There was an error processing the JSON response from ${
                this.notificationService.name
              } for of ${
                this.notificationData._id
              }. Error: ${err}. The Response: ${response.toString()}`
            );
          });
      })
      .catch((err) => {
        Journal.updateOne(
          { _id: this.notificationData._id },
          { $set: { notified: err.toString() } },
          (err, data) => {
            if (err)
              console.error(
                `error updating UBA notification result on journal at ${new Date().toString()} RRN : ${
                  this.notificationData.rrn
                }`
              );
            else
              console.log(
                `UBA notification result updated successfully at ${new Date().toString()} RRN : ${
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
      });

  }
}

module.exports = UbaNotifier;