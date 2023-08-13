/**
 * @author Abolaji
 */
require('dotenv').config();
const fetch = require('node-fetch');
const Merchants = require('../model/merchantsModel');
const Journal = require('../model/journalmodel');
const Util = require('../helpers/Util');
const Moment = require('moment');
const fs = require('fs');
const http = require('https');
const NotifyConfig = require('../config/genNotificationConfig.json');

 class GeneralNotificaton{


    constructor(notificationData){
        this.notificationData = notificationData;

        this.notificationUrl = process.env.gen_notify_url;
        this.merchantUrl = process.env.get_merchant_url;

        this.onlyFailed = process.env.onlyFailed == 'true' ? true : false;
        this.onlySelected = process.env.onlySelected == 'true' ? true : false;
    }


    async fetchMerchantDetails() {

        try {

            let merchant = await Merchants.findOne({
                merchant_id: this.notificationData.merchantId
            });

            if (merchant) {
                return merchant;
            } else
                return fetch(`${this.merchantUrl}${this.notificationData.merchantId}`,{
                    headers : {
                        method: 'GET',
                        Authorization : 'Bearer j38yo87hyedb67y8ypgedt6798390u87gsghsa989d7go8d',

                    },
                    agent: new http.Agent({
                            pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                            passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                            rejectUnauthorized: false
                    })
                    })
                    .then((response) => {

                        return response.json().then((res) => {

                            if (res.status == 200) {
                                let data = res.data;

                                merchant = {
                                    merchant_id: data.merchant_id,
                                    merchant_name: data.merchant_name,
                                    merchant_phone: data.merchant_phone,
                                    merchant_email: data.merchant_email,
                                    merchant_contact: data.merchant_contact,
                                    merchant_account_nr: data.merchant_account_nr
                                };

                                Merchants.create(merchant, (err, data) => {
                                    if (err) {
                                        console.error(`Error saving merchant info at ${new Date().toString()} error : ${err.toString()}`);
                                        Util.fileDataLogger(this.notificationData.terminalId,`Error saving merchant info at ${new Date().toString()} error : ${err.toString()}`);
                                    } else {
                                        console.log(`merchant info saved successfully merchant :${merchant.merchant_id}`)
                                        Util.fileDataLogger(this.notificationData.terminalId,`merchant info saved successfully merchant :${merchant.merchant_id}`)
                                    }
                                });

                                return merchant;

                            } else {

                                console.error(`Error fetching merchant info from host, merchant ID ${this.notificationData.merchantId}`);
                                Util.fileDataLogger(this.notificationData.terminalId,`Error fetching merchant info from host, merchant ID ${this.notificationData.merchantId}`);
                                return false;

                            }

                        }).catch((err) => {

                            console.error(`Error fetching merchant info from host, merchant ID ${this.notificationData.merchantId}`);
                            Util.fileDataLogger(this.notificationData.terminalId,`Error fetching merchant info from host, merchant ID ${this.notificationData.merchantId}`);
                            return false;

                        });


                    })
                    .catch((err) => {

                        console.error(`Error fetching the merchant info. Error: ${err}`);
                        Util.fileDataLogger(this.notificationData.terminalId,`Error fetching the merchant info. Error: ${err}`);
                        return false;
                        
                    });

        } catch (error) {
            console.error(`Error getting merchant info from DB, Error: ${error}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Error getting merchant info from DB, Error: ${error}`);
            return false;
        }
    }




    async sendNotification(){

        if(NotifyConfig.exclude.includes(this.notificationData.merchantId)) return;
        if(this.onlySelected && !NotifyConfig.selected.includes(this.notificationData.merchantId)) return;

        if(this.notificationData.MTI != '0200') return;

        if(this.onlyFailed && this.notificationData.responseCode == '00' ) return;

        let merchant = await this.fetchMerchantDetails();
        if(!merchant) return;

        this.addMerchant2Journal(merchant);

        let theBody = this.prepareRequestBody(merchant);
        let notificationBody = JSON.stringify(theBody);

        fetch(this.notificationUrl, {
            method: 'POST',
            body : notificationBody,
            headers : {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }

            })
            .then((response) => {

            response.json().then((data) => {


                if (data.status == 200) {
                    
                    console.log(`general notification sent sucessfully, RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()} Response: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`general notification sent sucessfully, RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()} Response: ${JSON.stringify(data)}`);
                    
                } else {

                    console.error(`Error sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()} response : ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.terminalId,`Error sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()} response : ${JSON.stringify(data)}`);

                }

            }).catch((err) => {

                console.error(`Error parsing response from sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()} error ${err.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`Error parsing response from sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()} error ${err.toString()}`);

            });


        })
        .catch((err) => {

            console.error(`Error sending general notification. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`Error sending general notification. Error: ${err}`);
            
        });

    }


    prepareRequestBody(merchant){
        
        let Formatter = new Intl.NumberFormat('en-NG', {
            minimumFractionDigits: 2
        });

        let amount = (this.notificationData.amount/100);
        amount = Formatter.format(amount);

        let approvedSms = `***POS Purchase***\rRRN: ${this.notificationData.rrn}\rTerminal: ${this.notificationData.terminalId}\rSTAN: ${this.notificationData.STAN}\rAmt: ${Util.padRight(amount,' ',10)}\rResCode: ${this.notificationData.responseCode}\rStatus: Approved\rAuthCode: ${this.notificationData.authCode}\r\rhttps://iisysgroup.com`;
        
        let failedSms = `***POS Purchase***\rRRN: ${this.notificationData.rrn}\rTerminal: ${this.notificationData.terminalId}\rSTAN: ${this.notificationData.STAN}\rAmt: ${Util.padRight(amount,' ',10)}\rResCode: ${this.notificationData.responseCode}\rStatus: ${this.adjustStatus(this.notificationData.messageReason)}\r\rhttps://iisysgroup.com`;
        
        let msgReq = {
            sms: [],
            email: []
        };

        if(merchant.merchant_phone){
            msgReq.sms.push({
                recipients: [merchant.merchant_phone],
                body: this.notificationData.responseCode == '00' ? approvedSms : failedSms,
            });
        }

        if(merchant.merchant_email){
            msgReq.email.push({
                sender:"",
                recipients: [merchant.merchant_email],
                cc: [],
                bcc: [],
                template: "purchase",
                body: "hello",
                subject: "POS Purchase Notification",
                html: "",
                details: {
                    merchant_name: this.notificationData.merchantName,
                    mid: this.notificationData.merchantId,
                    terminal_id: this.notificationData.terminalId,
                    day: Moment().format("YYYY-MM-DD"),
                    time: Moment().format("HH:mm A"),
                    expiryDate: "",
                    error: this.notificationData.responseCode == '00' ? false : true,
                    aid: "",
                    label: this.notificationData.responseCode,
                    mPan: this.notificationData.maskedPan,
                    payer: "",
                    rrn: this.notificationData.rrn,
                    stan: this.notificationData.STAN,
                    acode: this.notificationData.merchantCategoryCode,
                    amount: amount,
                    tvr: this.notificationData.TVR,
                    tsi: "",
                    crtm: this.notificationData.CRIM,
                    status_message: this.notificationData.messageReason,
                    version: "",
                    product: "",
                    merchant_address: this.notificationData.merchantAddress,
                    account_number: ""
              }
            });
        }
        console.log(JSON.stringify(msgReq));
        Util.fileDataLogger(this.notificationData.terminalId,JSON.stringify(msgReq));
        return msgReq;

    }

    adjustStatus(status){
        if(status.length <= 30)
            return Util.padRight(status," ",30);
        else{
            return status.substr(0,30);
        }
    }

    addMerchant2Journal(merchant){

        Journal.updateOne(this.notificationData, {$set : {merchant : merchant}}, (err, data)=>{
            if(err)
                console.error(`Error adding merchant info to journal RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()}`);
            else{
                console.log(`merchant info added to journal successfully RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.terminalId} at ${new Date().toString()}`);
            }
        });

    }




 }

 module.exports = GeneralNotificaton;