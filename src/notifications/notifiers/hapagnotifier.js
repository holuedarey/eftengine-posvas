
 const fetch = require('node-fetch');
 const Journal = require('../../model/journalmodel');
 const RegisteredNotification = require('../../model/registerednotificationmodel');
 const NotificationService = require('../../model/notificationservicemodel');
 const Util = require('../../helpers/Util');
 const crypto = require('crypto');
// const { response } = require('../../api/apiServer');
 
 class HapagNotifier {
     constructor(transactionData) {
 
         this.notificationData = transactionData;
         this.notificationService = null;
     }
 
 
     signRequest(toHash, secret) {
     
         let hash = crypto.createHash('sha512');
  
          hash.update(toHash + secret);
           
          return hash.digest('hex');
  
     }
 
     async prepareRegisteredNotificationServices() {
 
         try {
             // get distinct notificationServices _Id for the TID or MID
             let theRegisteredNotifications = RegisteredNotification.find({
                 $or: [{
                     merchantId: this.notificationData.merchantId
                 }, {
                     terminalId: this.notificationData.terminalId
                 },{
                     identifier: {$exists : true, $eq : Util.extractIdentifier(this.notificationData.customerRef)}
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
 
                 //console.log(`The Found Registered Notification Services ${notificationServices}`);
 
                 // if notification services are returned
                 if (notificationServices) {
 
                     this.notificationService = notificationServices.find(c=>c.notificationClass == "manual-hapag");
 
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
 
         if(!hasNotifiers || this.notificationService == null)
             return false;
 
         let customerRef = this.notificationData.customerRef;
         if(!customerRef)
         {
             console.error(`Customer Data not found to send notification; HAPAG Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
             Util.fileDataLogger(this.notificationData.terminalId,`Customer Data not found to send notification; HAPAG Transaction TID :${this.notificationData.terminalId}, RRN :${this.notificationData.rrn}, at ${new Date().toString()}`);
             return false;
         }
          
 
         let notificationUrl = this.notificationService.url;
 
         let CustmerDatas = customerRef.split("~");
         if(!CustmerDatas.length)
             return false;
 
         let strCustmerData = CustmerDatas[1];
 
         let custmerData = null;
         try{
             custmerData = JSON.parse(strCustmerData);
         }catch(error){
             return false;
         }
 
         
         let theBody = {
             billOfLaden : custmerData.billOfLaden,
             shippingNumber : custmerData.shippingNumber,
             pan : this.notificationData.maskedPan,
             reference : this.notificationData.rrn + Date.now(),
             amount : (this.notificationData.amount),
             toAcct: process.env.HAPAG_TOACCOUNT ,
             terminal : this.notificationData.terminalId,
             customerId : custmerData.customerId,
             customerNumber : custmerData.customerNumber,
             invoiceNumber : custmerData.invoiceNumber
         };

         let notificationBody = JSON.stringify(theBody);
 
         let notificationHeaders = {
            'Content-Type': "text/xml; charset=utf-8",
            "SOAPAction": "http://zenithbank.zenithMQuery.com/xquery/queryRequest"
        }
 
         console.log(`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
         Util.fileDataLogger(this.notificationData.terminalId,`Sending out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);
 
         
        let reqBody = {
            method: 'post',
            headers: notificationHeaders
        }

        // reqBody.body = `<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:xqu=\"http://zenithbank.zenithMQuery.com/xquery/\">\r\n <soapenv:Header/>\r\n <soapenv:Body>\r\n <xqu:queryRequest>\r\n <!--Optional:-->\r\n <xqu:xml><![CDATA[<request>\r\n <requests type='xpath'>\r\n <reference>${theBody.reference}</reference>\r\n<pan>${theBody.pan}</pan>\r\n<amount>${theBody.amount}</amount>\r\n<to_acct>${theBody.toAcct}</to_acct>\r\n<terminal>${theBody.terminal}</terminal>\r\n<Name></Name>\r\n<customerid>${theBody.customerId}</customerid>\r\n <Field>\r\n <field1>deposit slip/reference</field1>\r\n<field2>${theBody.customerNumber}</field2>\r\n<field3>${theBody.billOfLaden}</field3>\r\n<field4>${theBody.shippingNumber}</field4>\r\n<field5>${theBody.invoiceNumber}</field5>\r\n<field6>Name of Depositor</field6>\r\n<field6>GSM NO</field6>\r\n</Field>\r\n<User>\r\n<username>zenith_user</username>\r\n<password>pass_zenith</password>\r\n</User>\r\n</requests>\r\n</request>]]>\r\n</xqu:xml>\r\n</xqu:queryRequest>\r\n</soapenv:Body>\r\n</soapenv:Envelope>`
 
        reqBody.body = `<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:xqu=\"http://zenithbank.zenithMQuery.com/xquery/\">\r\n <soapenv:Header/>\r\n <soapenv:Body>\r\n <xqu:queryRequest>\r\n <!--Optional:-->\r\n <xqu:xml><![CDATA[<request>\r\n <requests type='xpath'>\r\n <reference>${theBody.reference}</reference>\r\n<pan>${theBody.pan}</pan>\r\n<amount>${theBody.amount}</amount>\r\n<to_acct>${theBody.toAcct}</to_acct>\r\n<terminal>${theBody.terminal}</terminal>\r\n<Name></Name>\r\n<customerid>${theBody.customerId}</customerid>\r\n <Field>\r\n <field1>deposit slip/reference</field1>\r\n<field2>${theBody.customerNumber}</field2>\r\n<field3>${theBody.billOfLaden}</field3>\r\n<field4>${theBody.shippingNumber}</field4>\r\n<field5>${theBody.invoiceNumber}</field5>\r\n<field6>Name of Depositor</field6>\r\n<field6>GSM NO</field6>\r\n</Field>\r\n<User>\r\n<username>zenith_user</username>\r\n<password>pass_zenith</password>\r\n</User>\r\n</requests>\r\n</request>]]>\r\n</xqu:xml>\r\n</xqu:queryRequest>\r\n</soapenv:Body>\r\n</soapenv:Envelope>`


         return fetch(notificationUrl, reqBody)
         .then((response) => {
             return response.text().then((text) => {
                let jsonResponse = JSON.parse(Util.convertXMLtoJSON(text));
 
                console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${text}`);
                Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(jsonResponse)}`);

                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef, terminalId : this.notificationData.terminalId },{$set : {notified : JSON.stringify(jsonResponse)}},(err,data)=>{
                    if(err)
                        console.error(`error updating HAPAG notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`HAPAG notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });
                const status = jsonResponse["soap:Envelope"]["soap:Body"]["queryRequestResponse"]["queryRequestResult"]._text;
                // let responseData = JSON.parse(data);
                // console.log(JSON.stringify(responseData));
                if (status == '00:Successful' ) {
                    return true;
                } else {
                    return false;
                }
             }).catch((err) => {
                Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef,terminalId : this.notificationData.terminalId },{$set : {notified : response.toString()}},(err,data)=>{
                    if(err)
                        console.error(`error updating HAPAG notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    else
                    console.log(`HAPAG notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                });

                console.log(`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                Util.fileDataLogger(this.notificationData.terminalId,`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
                return false;
             })

         }).catch(() => {
            Journal.updateOne({rrn : this.notificationData.rrn, customerRef : this.notificationData.customerRef},{$set : {notified : err.toString()}},(err,data)=>{
                if(err)
                    console.error(`error updating HAPAG notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                else
                console.log(`HAPAG notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
            });

            console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
            return false;

         });
 
     }
 }
 
 module.exports = HapagNotifier