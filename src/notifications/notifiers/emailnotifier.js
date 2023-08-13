/**
 * @author Abolaji
 */

require('dotenv').config();
const firstMonitorTerminalList = require('../../config/firstbankmonitor.json');
const gtbConfig = require('../../config/gtbmonitorConfig.json');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Journals = require('../../model/journalmodel');
const Merchants = require('../../model/merchantsModel');
const emailnotificationmerchants = require("../../config/merchantemailnotifierconfig.json");
const json2xls = require('json2xls');
const moment = require('moment-timezone');
const Util = require('./../../helpers/Util');
const { report } = require('process');

class EmailNotifier {

    async getTerminalIdsForMerchantId(merchant_id) {
        // const terminals = [];

        const terminals = await Merchants.findOne({ merchant_id });

        return terminals;

    }

    async generateEmailReportsForProfiledMerchants() {

        try {

            for (let merchant of emailnotificationmerchants) {

                const reportfile = await this.prepareReportsFileForMerchant(merchant);

                if(reportfile !== false) {

                    await this.emailMerchantReport(reportfile, merchant);

                }
            }

            console.log("Completed Reports for Profiled Merchants");
            return true;

        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async prepareReportsFileForMerchant(merchant) {
        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime", "merchantCategoryCode",
                "handlerName", "MTI", "maskedPan", "processingCode", "amount",
                "currencyCode", "messageReason", "responseCode", "authCode",
            ]
        };

        let startDate = moment().startOf('day').toDate();
        let endDate = moment().endOf('day').toDate();

        try {
            
            let report = await Journals.find({
                MTI: "0200",
                terminalId: {
                    $in: merchant.terminals
                },
                responseCode: "00",
                transactionTime: {
                    $gte: startDate,
                    $lte: endDate
                }
            }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);


            if (report.length <= 0)
                return false;

            option.fields.push('actualAmount');

            report.forEach(rep => {
                rep['actualAmount'] = rep.amount / 100;
            });

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/${merchant.identifier}-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;

        } catch (error) {

            console.error(error);
            return false;
        
        }

    }

    async emailMerchantReport(file, merchant) {

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
          from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
          to: merchant.receivers, // list of receivers
          bcc: "taiwo.oladapo@iisysgroup.com,femi.alayesanmi@iisysgroup.com",
          subject: `${merchant.identifier} Transaction Report for ${date}`, // Subject line
          text: `Hi, Download ${merchant.identifier} transaction report for ${date}`,
          attachments: [
            {
              path: file,
            },
          ],
        });
        return info;

    }

    async generateReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime", "merchantCategoryCode",
                "handlerName", "MTI", "maskedPan", "processingCode", "amount",
                "currencyCode", "messageReason", "responseCode", "authCode",
            ]
        };

        try {
            // let startDate = moment('20190629', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190629', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find({
                MTI: "0200",
                terminalId: {
                    $in: firstMonitorTerminalList.terminals
                },
                responseCode: "00",
                $and: [{
                    $or: [{
                        maskedPan: {
                            $regex: /^53/
                        }
                    }, {
                        maskedPan: {
                            $regex: /^23/
                        }
                    }]
                }, {
                    $or: [{
                            customerRef: {
                                $regex: /\b7.8.14FRD/
                            }
                        },
                        {
                            customerRef: {
                                $regex: /^fbn-discount/
                            }
                        }
                    ]
                }],
                transactionTime: {
                    $gte: startDate,
                    $lte: endDate
                }
            }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            option.fields.push('actualAmount');

            report.forEach(rep => {
                let actualAmount = rep.amount / 0.85;
                rep['actualAmount'] = actualAmount / 100;
                rep['amount'] = rep['amount'] / 100;
            });

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `FBN-report/mastercard-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async generateGTBReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime", "merchantCategoryCode",
                "handlerName", "MTI", "maskedPan", "processingCode", "amount",
                "currencyCode", "messageReason", "responseCode", "authCode",
            ]
        };

        try {
            // let startDate = moment('20190729', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190729', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find({
                MTI: "0200",
                terminalId: {
                    $in: gtbConfig.terminals
                },
                responseCode: "00",
                $and: [{
                        $or: [{
                            maskedPan: {
                                $regex: /^53/
                            }
                        }, {
                            maskedPan: {
                                $regex: /^23/
                            }
                        }]
                    }, {
                        customerRef: {
                            $regex: /^gtb-discount/
                        }
                    }
                ],
                transactionTime: {
                    $gte: startDate,
                    $lte: endDate
                }
            }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            option.fields.push('actualAmount');

            report.forEach(rep => {
                let amount = rep.amount;
                // amount is in kobo
                if (amount >= 190000 && amount <= 2850000) {
                    rep['actualAmount'] = amount / 95;
                } else if (amount > 2850000 && amount <= 9000000) {
                    rep['actualAmount'] = amount / 90;
                }

                rep['amount'] = rep['amount'] / 100;
            });

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `GTB-report/mastercard-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async emailReport() {
        let file = await this.generateReport();
        if (file == false)
            return false;
        if (!firstMonitorTerminalList.receivers)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: firstMonitorTerminalList.receivers, // list of receivers
            bcc: "taiwo.oladapo@iisysgroup.com,bolaji.oyerinde@iisysgroup.com,gbemi.adeniyi@iisysgroup.com,oluwatosin.dada@iisysgroup.com",
            subject: "Mastercard Transaction report for " + date, // Subject line
            text: "Hi, Download report for Mastercard transactions for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }


    async gtbEmailReport() {
        let file = await this.generateGTBReport();
        if (file == false)
            return false;
        if (!gtbConfig.receivers)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: gtbConfig.receivers, // list of receivers
            // bcc : "taiwo.oladapo@iisysgroup.com,bolaji.oyerinde@iisysgroup.com,gbemi.adeniyi@iisysgroup.com,oluwatosin.dada@iisysgroup.com", 
            subject: "Mastercard Transaction report for " + date, // Subject line
            text: "Hi, Download report for Mastercard transactions for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }


    async pullReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            let startDate = moment('20200122', 'YYYYMMDD').startOf('day').toDate();
            let endDate = moment('20200122', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            // let startDate = moment().startOf('day').toDate();
            // let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {terminalId : "22146AX6", rrn : {$in:["200123103931","200122085251"]}}, option.fields).sort('-responseCode').read("secondary");

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;
            // let filter = [];
            // report.forEach(rep => {
            //     let duration = moment.duration(moment(rep.handlerResponseTime).diff(moment(rep.transactionTime)))
            //     if(duration.asMinutes() < 1)
            //         filter.push(rep)
            // });
            // console.log(filter.length);
            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/pull-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }



    async generateFRSCReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime" ,"merchantCategoryCode",
                "MTI", "maskedPan","amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {responseCode : "00",customerRef : {$regex : /^frsc/ },MTI: "0200",transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/frsc-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async frscEmailReport() {
        let file = await this.generateFRSCReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: "mtiwari@tw-applications.com,rchhabra@xpwallet.com", // list of receivers
            bcc : "taiwo.oladapo@iisysgroup.com,bolaji.oyerinde@iisysgroup.com,gideon.mojolaoluwa@iisysgroup.com", 
            subject: "FRSC Transaction Report for " + date, // Subject line
            text: "Hi, Download FRSC transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }


    async generateFlutterReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {responseCode : "00",customerRef : {$regex : /^flutter/ },transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/flutter-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async flutterEmailReport() {
        let file = await this.generateFlutterReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.flutter_emails, // list of receivers
            bcc : "taiwo.oladapo@iisysgroup.com,bolaji.oyerinde@iisysgroup.com", 
            subject: "ITEX-FLUTTER Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX-FLUTTER transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }

    static async sendErrorAlert(mgs) {

        if(process.env.send_error_email != 'true')
            return;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: "itexbeejay@hotmail.com", // list of receivers
            // bcc: "anthony.idigbe@iisysgroup.com",
            subject: "Middle-Ware Error Alert, " + date, // Subject line
            text: mgs
        });

        return info;
    }
    
    static async sendPrepErrorAlert(mgs,terminalId = "") {
        if(process.env.send_error_email != 'true')
            return;
        
        let virtualTId = process.env.virtual_tids || "";
        let virtualTIdList = virtualTId.split(',');
        if(terminalId){
            if(virtualTIdList.includes(terminalId)){
                return;
            }
        }

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: "austin.awaro@iisysgroup.com", // list of receivers
            bcc: "sowunmi.dekalu@iisysgroup.com,itexbeejay@hotmail.com",
            subject: "Middle-Ware Alert, " + date, // Subject line
            text: mgs
        });

        return info;
    }

    static async sendCriticalErrorAlert(mgs) {
        if(process.env.send_error_email != 'true')
            return;
        
        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: "bolaji.oyerinde@iisysgroup.com,emmanuel.paul@iisysgroup.com", // list of receivers
            // bcc: "anthony.idigbe@iisysgroup.com,sanusi.segun@iisysgroup.com",
            subject: "Middle-Ware Error Alert, " + date, // Subject line
            text: mgs
        });


        return info;
    }

    /**
     * 
     * @param {Object} transaction journal object for notification
     */
    static async sendIlakErrorAlert(transaction) {

        let recepients = process.env.ilak_emails;
        if(!recepients) return;

        let xls = json2xls(transaction);

        let date = new Date().toDateString();

        let filesPath = `Report/ilak-notification-${transaction.terminalId}-${transaction.RRN}-${date}.xlsx`;

        let pathDir = path.dirname(filesPath);
        if (fs.existsSync(pathDir) == false) {
            fs.mkdirSync(pathDir)
        }

        fs.writeFileSync(filesPath, xls, 'binary');

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: recepients, // list of receivers
            bcc: "taiwo.oladapo@iisysgroup.com,bolaji.oyerinde@iisysgroup.com",
            subject: "ITEX-ILAk TRANSACTION NOTIFICATION FAILED " + date, // Subject line
            text: `Hi, You received this email because we couldn't reach you web service, download the attached transaction details,\nRRN: ${transaction.RRN}\nTerminalId: ${transaction.terminalId}`,
            attachments: [{
                path: filesPath
            }]
        });


        return info;
    }


    static async generate(){
        let terminal  = await Journals.aggregate([
            {$match : {$and : [{ $or : [{terminalId : {$regex : '^2044'}},{terminalId : {$regex : '^2063'}}]},{transactionTime : {
                $gte: moment("2019-09-01", 'YYYYMMDD').startOf('day').toDate()
            }}]}},
            // {$match : { $or : [{terminalId : {$regex : '^2044'}},{terminalId : {$regex : '^2063'}}]}},
            // {$match : {terminalId : {$regex : '^2044'}}},
            {$group : {_id : "$terminalId"}},
            {$project : {_id : 0, terminalId : "$_id"}},
            // {$count : 'count'}
        ]).allowDiskUse(true);

        let xls = json2xls(terminal);

        let date = new Date().toDateString();

        let filesPath = `Report/Access-TIDs-${date}.xlsx`;

        let pathDir = path.dirname(filesPath);
        if (fs.existsSync(pathDir) == false) {
            fs.mkdirSync(pathDir)
        }

        fs.writeFileSync(filesPath, xls, 'binary');

    }

    // mxpay
    async generateMxPayFailedReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime" ,"merchantCategoryCode",
                "MTI", "maskedPan","amount", "messageReason",
                "responseCode", "authCode"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {responseCode : {$ne : "00"},customerRef : {$regex : /^mxpay/ },MTI: "0200",transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/mxpay-failed-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async generateMxPayReversalReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime" ,"merchantCategoryCode",
                "MTI", "maskedPan","amount"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {customerRef : {$regex : /^mxpay/ },MTI: "0420",transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/mxpay-reversal-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async mxPayEmailReport() {
        let failed = await this.generateMxPayFailedReport();
        let reversed = await this.generateMxPayReversalReport();

        if (failed == false && reversed == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        let attr = [];
        if(failed) attr.push({path : failed});
        if(reversed) attr.push({path : reversed});

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: "pos-settlement@moredewlimited.com", // list of receivers
            bcc : "taiwo.oladapo@iisysgroup.com,bolaji.oyerinde@iisysgroup.com", 
            subject: "MOREDEW-ITEX Failed Transaction Report for " + date, // Subject line
            text: "Hi, Download failed transaction report for " + date,
            attachments: attr
        });
        return info;
    }

    // mxpay
    
    // access fail-over
    async generateAccessFailoverSettlementReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","tamsRRN","tamsStatus","tamsMessage"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();
            let handler  = Util.handlers.tamsMW;

            let report = await Journals.find(
            {$or:[{terminalId : {$regex : /^2063/ }},{terminalId : {$regex : /^2044/ }}],responseCode : "00",handlerUsed: handler,
            transactionTime: {
                $gte: startDate,
                $lt: endDate
            }
        }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let mappedData = this.mapAccessbankdataToReport(report);

            let xls = json2xls(mappedData);

            let date = new Date().toDateString();

            let filesPath = `Report/failover-transaction-settlement-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async generateAccessFailoverFailedReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","tamsRRN","tamsStatus","tamsMessage"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();
            let handler  = Util.handlers.tamsMW;

            let report = await Journals.find(
            {$or:[{terminalId : {$regex : /^2063/ }},{terminalId : {$regex : /^2044/ }}],
            responseCode : {$ne : "00"},
            tamsStatus: {$ne : "331"},
            handlerUsed: handler,
            transactionTime: {
                $gte: startDate,
                $lt: endDate
            }
        }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let mappedData = this.mapAccessbankdataToReport(report);

            let xls = json2xls(mappedData);

            let date = new Date().toDateString();

            let filesPath = `Report/failover-failed-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async accessFailoverEmailReport() {
        let success = await this.generateAccessFailoverSettlementReport();
        let failed = await this.generateAccessFailoverFailedReport();
        
        if (success == false && failed == failed)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        let attr = [];
        if(success) attr.push({path : success});
        if(failed) attr.push({path : failed});

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.access_report, // list of receivers
            bcc : process.env.access_bank_failover_mails, 
            subject: "ITEX Failover Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX failover transaction report for the date " + date,
            attachments: attr
        });
        return info;
    }
    // access fail-over
    
    // payant notified

    async generatePayantReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","pfmNotified"
            ]
        };

        try {
            // let startDate = moment('20190819', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20190819', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {terminalId : {$in: ["2058VX02","2058VX03","2058VX04","2058VX05","2058VX06","2058VX07","2058VX08","2058VX09","2058VX10","2058VX11","2058VX12","2058VX13","2058VX14","2058VX15","2058VX16","2058VX17","2058VX18","2058VX19","2058VX20","2058VX21"]},
            responseCode : "00",transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            let xls = json2xls(report, option);

            let date = new Date().toDateString();

            let filesPath = `Report/payant-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath, xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async payantEmailReport() {
        let file = await this.generatePayantReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.payant_report, // list of receivers
            bcc : "bolaji.oyerinde@iisysgroup.com,michel.kalavanda@iisysgroup.com,austin.awaro@iisysgroup.com", 
            subject: "ITEX Payant Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX Payant transaction report for the date " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }
    ////

    mapStanbicBankDSTVReports(reports) {

        return reports.map((i) => {

            return {
                transactionTime: i.transactionTime,
                maskedPan: i.maskedPan,
                smartCardNumber: i._doc.customData ? i._doc.customData.customerId : "",
                amount: (i.amount/100),
                terminalId: i.terminalId,
                referenceNumber: i.rrn,
                transactionNumber: i.STAN
            }
        });
    }
    
    async generateStanbicBankDstvReport() {
    
        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified", "customData"
            ]
        };
    
        try {
            // let startDate = moment('20200101', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20201212', 'YYYYMMDD').endOf('day').toDate();
    
            // // for live
    
            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();
    
            let report = await Journals.find({
                customerRef: {$regex : /^stbankdstv/ } ,
                transactionTime: {
                    $gte: startDate,
                    $lt: endDate
                },
                transactionTime: {
                    $gte: startDate,
                    $lt: endDate
                },
                responseCode: "00"
            }, option.fields).sort('-terminalId');
    
            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);
    
            if (report.length <= 0)
                return false;
    
            report = await this.mapStanbicBankDSTVReports(report);
    
            option = {
                fields: [
                    "transactionTime", "maskedPan", "smartCardNumber", "amount", 
                    "terminalId", "referenceNumber", "transactionNumber"
                ]
            };
            
            let xls = json2xls(report,option);
    
            let date = new Date().toDateString();
    
            let filesPath = `Report/stanbicdstv-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async stanbicDstvEmailReport() {
        let file = await this.generateStanbicBankDstvReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.stanbic_dstv_email_receivers, // list of receivers
            bcc : "femi.alayesanmi@iisysgroup.com,taiwo.oladapo@iisysgroup.com", 
            subject: "ITEX STANBIC DSTV Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX STANBIC DSTV transaction report for the date " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }
    
    
    async generateMikroReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20200101', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20200205', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find({
                $or: [{
                    customerRef: {
                        $regex: "^mikr"
                    }
                }, {
                    customerRef: {
                        $regex: "^mikro"
                    }
                }],
                transactionTime: {
                    $gte: startDate,
                    $lt: endDate
                }
            }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            report.forEach(rep => {
                rep['amount'] = rep.amount / 100;
            });

            if (report.length <= 0)
                return false;
            
            let xls = json2xls(report,option);

            let date = new Date().toDateString();

            let filesPath = `Report/mikro-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async MikroEmailReport() {
        let file = await this.generateMikroReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.mikro_emails, // list of receivers
            bcc : "femi.alayesanmi@iisysgroup.com", 
            subject: "ITEX-MIKRO Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX-MIRKO transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }

    async generateC24Report() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20200101', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20200205', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find({
                $or: [{
                    customerRef: {
                        $regex: "^c24"
                    }
                }, {
                    customerRef: {
                        $regex: "^C24"
                    }
                }],
                transactionTime: {
                    $gte: startDate,
                    $lt: endDate
                }
            }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;
            
            let xls = json2xls(report,option);

            let date = new Date().toDateString();

            let filesPath = `Report/c24-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async C24EmailReport() {
        let file = await this.generateC24Report();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.c24_emails, // list of receivers
            bcc : "bolaji.oyerinde@iisysgroup.com", 
            subject: "ITEX-C24 Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX-C24 transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }

    async generateEtranzactReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20200101', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20200205', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find({
                $or: [{
                    customerRef: {
                        $regex: "^etz"
                    }
                }, {
                    customerRef: {
                        $regex: "^ETZ"
                    }
                }, {terminalId: {$in: 
                    ['2070QJ44', '2070QJ89', '2070QJ63', '2070QJ66', '2070QK19', '2070QM35', '2070QJ92']}}],
                transactionTime: {
                    $gte: startDate,
                    $lt: endDate
                }
            }, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;

            option.fields.push('notificationResponse');

            report.forEach(rep => {
                rep['amount'] = rep.amount / 100;
                rep['notificationResponse'] = rep.notified;
    
            });
            
            let xls = json2xls(report,option);

            let date = new Date().toDateString();

            let filesPath = `Report/etz-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async EtranzactEmailReport() {
        let file = await this.generateEtranzactReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.etz_emails, // list of receivers
            bcc : "femi.alayesanmi@iisysgroup.com", 
            subject: "ITEX-ETRANZACT Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX-ETRANZACT transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }
    ///

    async generateSwiftaReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20200101', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20200205', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            {customerRef: {$regex:"^swifta"}, transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;
            
            let xls = json2xls(report,option);

            let date = new Date().toDateString();

            let filesPath = `Report/swifta-transaction-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async SwiftaEmailReport() {
        let file = await this.generateSwiftaReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.swifta_emails, // list of receivers
            bcc : "bolaji.oyerinde@iisysgroup.com", 
            subject: "ITEX-SWIFTA Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX-SWIFTA transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }


    async generateExchangeBoxReport() {

        let option = {
            fields: [
                "rrn", "merchantName", "merchantAddress", "merchantId",
                "terminalId", "STAN", "transactionTime","handlerResponseTime" ,"merchantCategoryCode",
                "MTI", "maskedPan", "processingCode", "amount", "messageReason",
                "responseCode", "authCode","notified"
            ]
        };

        try {
            // let startDate = moment('20200101', 'YYYYMMDD').startOf('day').toDate();
            // let endDate = moment('20200205', 'YYYYMMDD').endOf('day').toDate();

            // // for live

            let startDate = moment().startOf('day').toDate();
            let endDate = moment().endOf('day').toDate();

            let report = await Journals.find(
            { $or: [{customerRef: {$regex:"^exchangebox"}}, {terminalId: {$in: 
                ['2033DAD6', '2033DAE1', '2033DAE5', '2033DAE6', '2033DAE7', '2033DAF0', '2033DAF1', 
                '2033DAF2', '2033DAF3', '2033DAF7', '2033DAF9', '2033DAG4', '2033DAG5',
                '2033DAG7', '2033DAG8', '2033DAH0', '2033DAH1', '2033FLX4', 
                '2033FLX5', '2033FLX6', '2033FLX7', '2033FLX8', '2033FLX9', '2033FLY0', '2033FLY1', 
                '2033FLY2', '2033FMB4', '2033FMB7', '2033FMB8', '2033FMC0', '2033FMC2', '2033FMC3']}}],
                transactionTime: {
                $gte: startDate,
                $lt: endDate
            }}, option.fields).sort('-terminalId');

            console.log(`Transaction found: ${report.length} at ${new Date().toString()}`);

            if (report.length <= 0)
                return false;
            
            let xls = json2xls(report,option);

            let date = new Date().toDateString();

            let filesPath = `Report/transaction-exchange-report-${date}.xlsx`;
            let pathDir = path.dirname(filesPath);
            if (fs.existsSync(pathDir) == false) {
                fs.mkdirSync(pathDir)
            }
            fs.writeFileSync(filesPath,xls, 'binary');
            return filesPath;
        } catch (error) {
            console.error(error);
            return false;
        }
    }


    async ExchangeBoxEmailReport() {
        let file = await this.generateExchangeBoxReport();
        if (file == false)
            return false;

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER, // generated ethereal user
                pass: process.env.SMTP_PASS // generated ethereal password
            }
        });

        let date = new Date().toDateString();

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"ITEX EFT-ENGINE" <i-alert@iisysgroup.com>', // sender address
            to: process.env.exhangebox_emails, // list of receivers
            bcc : "bolaji.oyerinde@iisysgroup.com", 
            subject: "ITEX-ExchangeBox Transaction Report for " + date, // Subject line
            text: "Hi, Download ITEX-ExchangeBox transaction report for " + date,
            attachments: [{
                path: file
            }]
        });
        return info;
    }







    async sendReports(){

        this.gtbEmailReport().then(info=>{

            Util.fileDataLogger("Email-Cronservice", `GTB Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{

            Util.fileDataLogger("Email-Cronservice", `Unable to send GTB report at ${new Date().toString()} err: ${err.toString()}`);

        });


        this.frscEmailReport().then(info=>{

            Util.fileDataLogger("Email-Cronservice", `FRSC Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{

            Util.fileDataLogger("Email-Cronservice", `Unable to send FRSC report at ${new Date().toString()} err: ${err.toString()}`);

        });


        this.MikroEmailReport().then(info=>{

            Util.fileDataLogger("Email-Cronservice", `MIKRO Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send MIKRO report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.C24EmailReport().then(info=>{

            Util.fileDataLogger("Email-Cronservice", `C24 Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send C24 report at ${new Date().toString()} err: ${err.toString()}`);

        })
        
        this.mxPayEmailReport().then(info=>{
        
            Util.fileDataLogger("Email-Cronservice", `MXPAY Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
         
            Util.fileDataLogger("Email-Cronservice", `Unable to send MXPAY report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.EtranzactEmailReport().then(info=>{
            Util.fileDataLogger("Email-Cronservice", `Etranzact Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send Etranzact report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.flutterEmailReport().then(info=>{
            Util.fileDataLogger("Email-Cronservice", `FLUTTER Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send FLUTTER report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.accessFailoverEmailReport().then(info=>{
            Util.fileDataLogger("Email-Cronservice", `Access Failover Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send Access Failover report at ${new Date().toString()} err: ${err.toString()}`);

        })


        this.payantEmailReport().then(info=>{

            Util.fileDataLogger("Email-Cronservice", `Payant Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send  Payant report at ${new Date().toString()} err: ${err.toString()}`);

        })



        this.SwiftaEmailReport().then(info=>{
            Util.fileDataLogger("Email-Cronservice", `Swifta Report sent successfully at ${new Date().toString()}`);

        })
        .catch(err=>{

            Util.fileDataLogger("Email-Cronservice", `Unable to send Swifta report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.ExchangeBoxEmailReport().then(info=>{
            Util.fileDataLogger("Email-Cronservice", `Exchange box Report sent at ${new Date().toString()}`);

        })
        .catch(err=>{

            Util.fileDataLogger("Email-Cronservice", `Unable to send Exchange box report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.stanbicDstvEmailReport().then(info=>{
            Util.fileDataLogger("Email-Cronservice", `Stanbic Dstv Email Report sent at ${new Date().toString()}`);

        })
        .catch(err=>{

            Util.fileDataLogger("Email-Cronservice", `Unable to send Stanbic Dstv Email Report report at ${new Date().toString()} err: ${err.toString()}`);

        })

        this.generateEmailReportsForProfiledMerchants().then(info => {
         
            Util.fileDataLogger("Email-Cronservice", `Profiled Merchants Report sent at ${new Date().toString()}`);

        }).catch(err=>{
            Util.fileDataLogger("Email-Cronservice", `Unable to send Profiled Merchants  report at ${new Date().toString()} err: ${err.toString()}`);

        });

    }


    mapAccessbankdataToReport(report){

        let mappedData = report.filter(c=>c.tamsStatus).map(r=>{
            let fromAcc = Util.getFromAccount(r.processingCode);
            return{
                DateTime : moment(r.transactionTime).tz('Africa/Lagos').startOf('day').format('DD/MM/YYYY h:mm'),
                Currency_Name : "Naira",
                Local_Date_Time : moment(r.transactionTime).tz('Africa/Lagos').format('DD/MM/YYYY hh:mm'),
                Terminal_ID : r.terminalId,
                Merchant_Name_Location : r.merchantAddress,
                STAN : r.STAN,
                PAN : r.maskedPan,
                Message_Type : "200",
                From_Account_ID : "",
                Merchant_ID : r.merchantId,
                Merchant_Account_Nr : "",
                Merchant_Account_Name : r.merchantName,
                From_Account_Type : fromAcc,
                Tran_Type_Description : "Purchase",
                Response_Code_Description : r.tamsMessage || "no response",
                Response_Code : r.tamsStatus|| "",
                Tran_Amount_Req : (r.amount/100),
                Tran_Amount_Rsp : (r.amount/100),
                Surcharge : 0,
                Amount_Impact : -(r.amount/100),
                Merch_Cat_Category_Name : r.merchantName,
                Merch_Cat__Visa_Code : r.merchantCategoryCode,
                Settlement_Impact : (r.amount/100),
                Settlement_Impact_Desc : "Receivable",
                Auth_ID : r.authCode,
                Tran_ID : "",
                Retrieval_Reference_Nr : r.tamsRRN || r.rrn,
                Totals_Group : "",
                Region : "Domestic",
                Transaction_Status : r.responseCode == 0 ? "Successful" : "Failed",
                Card_Route : "",
                Transaction_Type_Impact : "Financial",
                Reversal_Status : "Regular_Transactions",
                Message_Type_Desc : "Request",
                Trxn_Category : ""
            }
        });

        return mappedData;
    }


}

module.exports = EmailNotifier;
