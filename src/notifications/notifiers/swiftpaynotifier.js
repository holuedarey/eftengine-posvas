require("dotenv").config();
const crypto = require('crypto');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const Moment = require('moment');
const convert2XML = require('jsontoxml');
const converter = require('xml-js');

class SwiftPayNotifier {

    constructor(notificationService, notificationData, options = {}) {
        this.notificationService = notificationService;
        this.notificationData = notificationData;
        this.options = options;
    }

    sendNotification() {
        console.log('did we enter send notification for swift??');
        let reversal = false;

        if(this.notificationData.responseCode != '00') return;
        
        let customerName = "", customerId = "";
        let customerRef = this.notificationData.customerRef;
        let refs = customerRef.split('~');
        if(refs.length > 1) {
            customerId = refs[1];
            customerName = refs[2];
        }

        const theBody = {
            PaymentNotificationRequest: {
                Payments: {
                    Payment :{
                        PaymentLogId: this.notificationData.rrn,
                        CustReference: customerId,
                        Amount: Number((this.notificationData.amount/100).toFixed(2)),
                        PaymentMethod: "POS",
                        PaymentReference: `ITEX|CARD|SWIFT|${this.notificationData.rrn}|`,
                        TerminalId: this.notificationData.terminalId,
                        ChannelName: "ITEX POS",
                        Location: "",
                        PaymentDate: Moment(this.notificationData.transactionTime).format('YYYY-MM-DD h:mm:ss a'),
                        InstitutionId: "SWIFT",
                        InstitutionName: "SWIFT Networks",
                        CustomerName:customerName,
                        ReceiptNo: this.notificationData.rrn,
                        DepositorName: "",
                        DepositSlipNumber: "",
                        PaymentCurrency: "566",
                        IsReversal: false,
                        PaymentItems : {
                            PaymentItem : {
                                ItemName: "Subscription",
                                ItemCode: "40303",
                                ItemAmount: Number((this.notificationData.amount/100).toFixed(2)),
                            }
                        }
                    }
                }
            }
        }
        const swiftNotifyUrl = this.notificationService.url + `?Username=${process.env.SWIFT_AUTH_USERNAME}&Password=${process.env.SWIFT_AUTH_PASSWORD}&Partner=${process.env.SWIFT_AUTH_PARTNER}&customer_id=${customerId}`;
        const notificationBody = `<?xml version="1.0" encoding="UTF-8"?>` + convert2XML(theBody);

        let notificationHeaders = {
            'Content-Type': 'application/xml'
        }

        console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
        Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

        return fetch(`${swiftNotifyUrl}`, {
            method: 'POST',
            headers : notificationHeaders,
            body: notificationBody,
            })
            .then((response) => response.text())
            .then(xmlResponse => {
                const {_declaration, ...extractedResponse} = JSON.parse(converter.xml2json(xmlResponse, {compact: true, spaces: 4}));
                let res = {};
                res.error = false;      res.data = extractedResponse;

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(res)}},(err,data)=>{
                    if(err)
                        console.error(`error updating Swift notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Swift notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(res)}`);
                // return res;
            })
            .catch((err) => {
                let res = {};
                console.error(`Error fetching the POS info. Error: ${err}`);
                res.error = true;       res.errorMessage = err.message;

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : xmlResponse.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Swift notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Swift notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                // return res;
            }).catch((err) => {

                Journal.updateOne({_id : this.notificationData._id},{$set : {notified : err.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating Swift notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`Swift notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            });

    }

}

module.exports = SwiftPayNotifier;