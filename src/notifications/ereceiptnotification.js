require('dotenv').config();
const fetch = require('node-fetch');
const Merchants = require('../model/merchantsModel');
const Journal = require('../model/journalmodel');
const Util = require('../helpers/Util');
const Moment = require('moment');
const fs = require('fs');
const http = require('https');
const twilo = require('twilio');


class EReceiptService{


    constructor(notificationData,trxn){
        this.notificationData = notificationData;
        this.notificationData.resp = [null,undefined,"100","99"].includes(trxn.responseCode) ? "06" : trxn.responseCode;
        this.notificationData.acode = trxn.authCode || ""
        this.trxn = trxn;

        this.notificationUrl = process.env.gen_notify_url;
        this.merchantUrl = process.env.get_merchant_url;

        this.onlyFailed = process.env.receipt_only_failed == 'true' ? true : false;
    }


    async fetchMerchantDetails() {

        try {

            let merchant = await Merchants.findOne({
                merchant_id: this.notificationData.mid
            });

            if (merchant) {
                return merchant;
            } else
                return fetch(`${this.merchantUrl}${this.notificationData.mid}`,{
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
                                        // Util.fileDataLogger(this.notificationData.tid,`Error saving merchant info at ${new Date().toString()} error : ${err.toString()}`);
                                    } else {
                                        console.log(`merchant info saved successfully merchant :${merchant.merchant_id}`)
                                        // Util.fileDataLogger(this.notificationData.tid,`merchant info saved successfully merchant :${merchant.merchant_id}`)
                                    }
                                });

                                return merchant;

                            } else {

                                console.error(`Error fetching merchant info from host, merchant ID ${this.notificationData.mid}`);
                                // Util.fileDataLogger(this.notificationData.tid,`Error fetching merchant info from host, merchant ID ${this.notificationData.mid}`);
                                return false;

                            }

                        }).catch((err) => {

                            console.error(`Error fetching merchant info from host, merchant ID ${this.notificationData.mid}`);
                            // Util.fileDataLogger(this.notificationData.tid,`Error fetching merchant info from host, merchant ID ${this.notificationData.mid}`);
                            return false;

                        });


                    })
                    .catch((err) => {

                        console.error(`Error fetching the merchant info. Error: ${err}`);
                        // Util.fileDataLogger(this.notificationData.tid,`Error fetching the merchant info. Error: ${err}`);
                        return false;
                        
                    });

        } catch (error) {
            console.error(`Error getting merchant info from DB, Error: ${error}`);
            // Util.fileDataLogger(this.notificationData.tid,`Error getting merchant info from DB, Error: ${error}`);
            return false;
        }
    }




    async sendNotification(){

        // if(this.notificationData.mti != '0200'){
        //     return;
        // }

        if(this.onlyFailed && this.notificationData.resp == '00' ) {
            return;
        }

        let email =[];
        let phone = [];

        let merchant = await this.fetchMerchantDetails();
        if (merchant) {
            // phone = merchant.merchant_phone;
            if (merchant.merchant_email) email.push(merchant.merchant_email);
        }

        if(this.notificationData.cust_email) email.push(this.notificationData.cust_email);
        if(this.notificationData.cust_phone) phone.push(this.notificationData.cust_phone);

        if(!email.length && !phone.length){
            return;
        }

        let theBody = this.prepareRequestBody(email,phone);
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
                    
                    console.log(`general notification sent sucessfully, RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()} Response: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.tid,`general notification sent sucessfully, RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()} Response: ${JSON.stringify(data)}`);
                    this.updateJournal(true);
                    
                } else {

                    console.error(`Error sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()} response : ${JSON.stringify(data)}`);
                    Util.fileDataLogger(this.notificationData.tid, `Error sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()} response : ${JSON.stringify(data)}`);
                    this.updateJournal();
                }

            }).catch((err) => {

                console.error(`Error parsing response from sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()} error ${err.toString()}`);
                Util.fileDataLogger(this.notificationData.tid, `Error parsing response from sending general notification RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()} error ${err.toString()}`);
                this.updateJournal();
            });


        })
        .catch((err) => {
            this.updateJournal();
            console.error(`Error sending general notification. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.tid,`Error sending general notification. Error: ${err}`);
        });

    }


    prepareRequestBody(email,phone){
        
        let Formatter = new Intl.NumberFormat('en-NG', {
            minimumFractionDigits: 2
        });

        let amount = Formatter.format(this.notificationData.amount/100);

        let approvedSms = `***POS Purchase***\rRRN: ${this.notificationData.rrn}\rTerminal: ${this.notificationData.tid}\rSTAN: ${this.notificationData.stan}\rAmt: ${Util.padRight(amount,' ',10)}\rResCode: ${this.notificationData.resp}\rStatus: Approved\rAuthCode: ${this.notificationData.acode}\r\rhttps://iisysgroup.com`;
        
        let failedSms = `***POS Purchase***\rRRN: ${this.notificationData.rrn}\rTerminal: ${this.notificationData.tid}\rSTAN: ${this.notificationData.stan}\rAmt: ${Util.padRight(amount,' ',10)}\rResCode: ${this.notificationData.resp}\rStatus: ${this.adjustStatus(Util.getNibssResponseMessageFromCode(this.notificationData.resp))}\r\rhttps://iisysgroup.com`;
        
        let msgReq = {
            sms: [],
            email: []
        };

        // if(phone){
        //     msgReq.sms.push({
        //         recipients: phone,
        //         body: this.notificationData.resp == '00' ? approvedSms : failedSms,
        //     });
        // }

        if(email){
            msgReq.email.push({
                sender:"",
                recipients: email,
                cc: [],
                bcc: [],
                template: "purchase",
                body: "hello",
                subject: "POS E-Receipt",
                html: "",
                details: {
                    merchant_name: this.notificationData.merchantName,
                    mid: this.notificationData.mid,
                    terminal_id: this.notificationData.tid,
                    day: Moment(this.notificationData.timestamp).format("YYYY-MM-DD"),
                    time: Moment(this.notificationData.timestamp).format("HH:mm A"),
                    expiryDate: this.notificationData.expiryDate,
                    error: this.notificationData.resp == '00' && ["0200","0100"].includes(this.notificationData.mti) ? false : true,
                    aid: this.notificationData.aid,
                    label: this.notificationData.label,
                    mPan: this.notificationData.mPan,
                    payer: this.notificationData.cardName,
                    rrn: this.notificationData.rrn,
                    stan: this.notificationData.stan,
                    acode: this.notificationData.acode,
                    amount: amount,
                    tvr: this.notificationData.tvr || "",
                    tsi: this.notificationData.tsi || "",
                    crtm: this.notificationData.crtm || "",
                    status_message: `${Util.getNibssResponseMessageFromCode(this.notificationData.resp)}(${this.notificationData.resp})`,
                    version: "",
                    product: "",
                    merchant_address: this.notificationData.merchantAddress  || "",
                    account_number: "",
                    type: this.notificationData.mti == "0420" ? "reversal" : "purchase"
              }
            });
        }
        console.log(JSON.stringify(msgReq));
        Util.fileDataLogger(this.notificationData.tid,JSON.stringify(msgReq));
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
                console.error(`Error adding merchant info to journal RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()}`);
            else{
                console.log(`merchant info added to journal successfully RRN: ${this.notificationData.rrn}, terminal: ${this.notificationData.tid} at ${new Date().toString()}`);
            }
        });

    }

    sendWhatsappMessage(phone){

        let Formatter = new Intl.NumberFormat('en-NG', {
            minimumFractionDigits: 2
        });

        let amount = Formatter.format(this.notificationData.amount/100);

        let approvedSms = `***POS Purchase***\rRRN: ${this.notificationData.rrn}\rTerminal: ${this.notificationData.tid}\rSTAN: ${this.notificationData.stan}\rAmt: ${Util.padRight(amount,' ',10)}\rResCode: ${this.notificationData.resp}\rStatus: Approved\rAuthCode: ${this.notificationData.acode}\r\rhttps://iisysgroup.com`;
        
        let failedSms = `***POS Purchase***\rRRN: ${this.notificationData.rrn}\rTerminal: ${this.notificationData.tid}\rSTAN: ${this.notificationData.stan}\rAmt: ${Util.padRight(amount,' ',10)}\rResCode: ${this.notificationData.resp}\rStatus: ${this.adjustStatus(Util.getNibssResponseMessageFromCode(this.notificationData.resp))}\r\rhttps://iisysgroup.com`;
        
        twilo.messages.create({
            from: `whatsapp:${process.env.whatsapp_from}`,
            body: this.notificationData.resp == '00' ? approvedSms : failedSms,
            to: `whatsapp:${phone}`
          }).then(message => console.log(message.sid));

    }

    updateJournal(flag=false){
        Journal.updateOne({_id : this.trxn._id},{$set : {receipt :"e-receipt",receiptSent : flag}},(err,data)=>{
            if(err)
                console.error(`error updating ereceipt response on journal at ${new Date().toString()} RRN : ${this.trxn.rrn}`);
            else
                console.log(`ereceipt response updated successfully at ${new Date().toString()} RRN : ${this.trxn.rrn}`);
        });
    }




 }

 module.exports = EReceiptService;