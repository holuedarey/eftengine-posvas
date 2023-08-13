/**
 * @author Adeyemi Sola
 * Access DCR - Direct Card Routing controller
 */
require('dotenv').config();
// const baseMessage = require('../ciso8583/engine/dataelements.json');
// const baseSubFieldMessage = require('../ciso8583/engine/subField-data-elements.json');
// const CISO = require('../ciso8583/CISO');
const Util = require('../helpers/Util');
// const config = require('../ciso8583/engine/interswitch-dataelement-config.json');
// const ClientSocket = require('../socket/socketclient');
// const InterswitchConfig = require('../model/interswitchConfigModel');
// const CronJob = require('cron').CronJob;
const ExtractKeys = require('../helpers/ExtractKeys');
const TerminalKey = require('../model/terminalkeysModel');
const Journal = require('../model/journalmodel');
const axios = require('axios');
const dataElements128 = require('../config/dataelements128.json');
const TransactionEvent = require('../events/transactionevent');
const SocketClient = require('../socket/socketclient');
 
 class AccessRerouteHandler {
 
    constructor(socketServerConnection, iso8583Parser, prrn, unpackedMessage, extralData, requestData) {
        // socketServerConnection
        this.accessRerouteIp = process.env.ACCESS_REROUTE_IP;
        this.accessReroutePort = process.env.ACCESS_REROUTE_PORT;
        this.iso8583Parser = iso8583Parser;
        this.socketConnection = socketServerConnection;
        this.prrn = prrn;
        this.handlerName = process.env.handler + " APT_PAY";
        this.handlerUsed = 'APT_PAY';
        this.handlingModel = Journal;
        this.unpackedMessage = unpackedMessage;
        this.requestData = requestData;
        this.transactionDetails = {};
        this.vasData = extralData ? extralData["vasData"] || null : null;
        this.vas4Data = extralData ? extralData["vas4Data"] || null : null;
        this.handlerEvent = new TransactionEvent();
    }


    async sendReversalRequest(unpackedMessage, terminal) {
         let requestData = {};
         Object.assign(requestData, unpackedMessage.dataElements);
 
         const interswitchResponse = !!unpackedMessage.dataElements["52"] 
             ? await this.sendTransactionOnlineReversal(unpackedMessage, terminal) : this.sendTransactionOfflineReversal(unpackedMessage);
 
         return interswitchResponse;
    }

    async process(){
        let response = {
            error: false
        }

        let terminalKeys = await TerminalKey.findTerminal(this.unpackedMessage.dataElements[41]);
        if(this.unpackedMessage.dataElements['52']){
            //Use a different component key to encrypt the pinblock
            this.unpackedMessage.dataElements['52'] = this.calculateAccessDCRPinblock(this.unpackedMessage.dataElements['52'],terminalKeys)
        }

        let initialSave = await this.saveInitialTransaction();

        if (initialSave === false) {
            response.error = true;
            response.message = "Unable to save initial transaction, aborting";
            console.error(`There was an error saving the initial transaction, aborting`);
            EmailNotifier.sendCriticalErrorAlert("There was an error saving the initial transaction, aborting");
        }
        Util.fileIsoLogger(this.unpackedMessage,this.requestData.toString());
        
        let result = await this.sendTransactionRequest(this.unpackedMessage);
        console.log('response data', result.data);
        
        if(!result){
            // result = await this.processFailoverRequest(terminal,terminalId,99,theSocketClientInstance);
            // if(result === null)return;
            // if(result !== false && result !== null ){
            //     this.afterTransactionProcess(result,theSocketClientInstance);
            //     return;
            // }
            response.error = true;
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`No Response from Access DCR` + JSON.stringify({error: 'Request timeout error'}));
            await this.updateNoResponseTransaction(this.getResponseMessageFromCodeAccessDCR('100'))
        }
        else if(result.code === "ETIMEDOUT"){
            response.error = true;
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Response from Access DCR` + JSON.stringify({error: 'NO response error'}));
            await this.updateNoResponseTransaction(this.getResponseMessageFromCodeAccessDCR('99'))
        }else if(result.data['f39'] !== '00'){
            response.error = true;
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Direct Response from Access DCR` + JSON.stringify(result.data));
            //if it doesn't return approved, can you failover to TAMS?

            await this.updateSavedTransaction(result.data['f39']);
        }else {

            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Direct Response from Access DCR` + JSON.stringify(result.data));
            await this.updateSavedTransaction('00', result.data);
        }
        
        response = {
            ...response,
            data: result.data
        }
        this.afterTransactionProcess(response, terminalKeys);
        return response;
    }
    

    async saveInitialTransaction() {

        let saveDetails = {
            rrn: this.unpackedMessage.dataElements[37],
            prrn: this.prrn,
            onlinePin: (this.unpackedMessage.dataElements[52] !== null ? true : false),
            merchantName: this.unpackedMessage.dataElements[43].substring(0, 22),
            merchantAddress: this.unpackedMessage.dataElements[43].substring(23),
            merchantId: this.unpackedMessage.dataElements[42],
            terminalId: this.unpackedMessage.dataElements[41],
            STAN: this.unpackedMessage.dataElements[11],
            transactionTime: new Date(),
            merchantCategoryCode: this.unpackedMessage.dataElements[18],
            handlerName: this.handlerName,
            MTI: this.unpackedMessage.mti,
            maskedPan: this.unpackedMessage.dataElements[2].substr(0, 6) + ''.padEnd(this.unpackedMessage.dataElements[2].length - 10, 'X') + this.unpackedMessage.dataElements[2].slice(-4),
            processingCode: this.unpackedMessage.dataElements[3],
            amount: parseInt(this.unpackedMessage.dataElements[4]),
            currencyCode: this.unpackedMessage.dataElements[49],
            messageReason: this.unpackedMessage.dataElements[56],
            originalDataElements: this.unpackedMessage.dataElements[90],
            customerRef: this.unpackedMessage.dataElements[59] || "",
            cardExpiry: this.unpackedMessage.dataElements[14] || "",
            transactionType: this.vasData !== null || this.vas4Data !== null ? 'VAS' : 'Purchase',
            isVasComplete: false,
            vasData: this.vas4Data !== null ? this.vas4Data : this.vasData !== null ? this.vasData : null,
            handlerUsed: this.handlerUsed
        }


        if (Util.isMtiType(this.unpackedMessage, '02') && Util.getICCData(this.unpackedMessage) !== false) {
            let iccData = Util.getICCData(this.unpackedMessage);
            saveDetails.TVR = iccData.get('95');
            saveDetails.CRIM = iccData.get('9F26');
        }

        // extracting e-journal details and saving to db for transaction
        let customData = saveDetails.customerRef.split('~')

        customData = Util.extractEjournalDatafromTLV(customData[customData.length - 1]);

        if (customData !== {} && customData.aid !== undefined) {
            saveDetails.ejournalData = customData;
        }

        this.transactionDetails = {
            ...this.transactionDetails,
            ...saveDetails
        };

        //console.log(this.transactionDetails);
        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),JSON.stringify(this.transactionDetails));

        // transaction data before process
        this.handlingModelInstance = new this.handlingModel(saveDetails);
        let saved = false;

        await this.handlingModelInstance.save().then(() => {
                console.log(`Saved Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Saved Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);
                saved = true;
            })
            .catch((error) => {
                console.error(`Exception Saving ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Exception Saving ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                Util.failedDbLogs(`Exception Saving ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                EmailNotifier.sendCriticalErrorAlert(`Exception Saving ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
            });
        return saved;
    }

    getResponseMessageFromCodeAccessDCR(code){
        switch (code) {
            case "00":
                return "Approved";
            case "01":
                return "Refer to card issuer";
            case "02":
                return "Refer to card issuer, special condition";
            case "03":
                return "Invalid merchant";
            case "04":
                return "Pick-up card";
            case "05":
                return "Do not honor";
            case "06":
                return "Error";
            case "07":
                return "Pick-up card, special condition";
            case "08":
                return "Honor with identification";
            case "09":
                return "Request in progress";
            case "10":
                return "Approved,partial";
            case "11":
                return "Approved,VIP";
            case "12":
                return "Invalid transaction";
            case "13":
                return "Invalid amount";
            case "14":
                return "Invalid card number";
            case "15":
                return "No such issuer";
            case "16":
                return "Approved,update track 3";
            case "17":
                return "Customer cancellation";
            case "18":
                return "Customer dispute";
            case "19":
                return "Re-enter transaction";
            case "20":
                return "Invalid response";
            case "21":
                return "No action taken";
            case "22":
                return "Suspected malfunction";
            case "23":
                return "Unacceptable transaction fee";
            case "24":
                return "File update not supported";
            case "25":
                return "Unable to locate record";
            case "26":
                return "Duplicate record";
            case "27":
                return "File update edit error";
            case "28":
                return "File update file locked";
            case "29":
                return "File update failed";
            case "30":
                return "Format error";
            case "31":
                return "Bank not supported";
            case "32":
                return "Completed, partially";
            case "33":
                return "Expired card, pick-up";
            case "34":
                return "Suspected fraud, pick-up";
            case "35":
                return "Contact acquirer, pick-up";
            case "36":
                return "Restricted card, pick-up";
            case "37":
                return "Call acquirer security, pick-up";
            case "38":
                return "PIN tries exceeded, pick-up";
            case "39":
                return "No credit account";
            case "40":
                return "Function not supported";
            case "41":
                return "Lost card";
            case "42":
                return "No universal account";
            case "43":
                return "Stolen card";
            case "44":
                return "No investment account";
            case "51":
                return "Not sufficent funds";
            case "52":
                return "No check account";
            case "53":
                return "No savings account";
            case "54":
                return "Expired card";
            case "55":
                return "Incorrect PIN";
            case "56":
                return "No card record";
            case "57":
                return "Transaction not permitted to cardholder";
            case "58":
                return "Transaction not permitted on terminal";
            case "59":
                return "Suspected fraud";
            case "60":
                return "Contact acquirer";
            case "61":
                return "Exceeds withdrawal limit";
            case "62":
                return "Restricted card";
            case "63":
                return "Security violation";
            case "64":
                return "Original amount incorrect";
            case "65":
                return "Exceeds withdrawal frequency";
            case "66":
                return "Call acquirer security";
            case "67":
                return "Hard capture";
            case "68":
                return "Response received too late";
            case "75":
                return "PIN tries exceeded";
            case "77":
                return "Intervene, bank approval required";
            case "78":
                return "Intervene, bank approval required for partial amount";
            case "90":
                return "Cut-off in progress";
            case "91":
                return "Issuer or switch inoperative";
            case "92":
                return "Routing error";
            case "93":
                return "Violation of law";
            case "94":
                return "Duplicate transaction";
            case "95":
                return "Reconcile error";
            case "96":
                return "System malfunction";
            case "98":
                return " Exceeds cash limit";
            // custom by me
            case "99" : 
                return "no Response"
            case "100" :
                return "Request Timedout"
            case "101":
                return "Failover Direct"
            ///////////////
            default:
                return "unknown";
        }
    }

    async updateSavedTransaction(responseCode = '91', accessResponse = null) {
        let updateDetails = {
            messageReason: this.getResponseMessageFromCodeAccessDCR(responseCode),
            failOverRrn: '',
            oldResCode: this.transactionDetails.oldResCode ? this.transactionDetails.oldResCode : '',
            responseCode: responseCode,
            script: this.unpackedMessage.dataElements[55],
            authCode: this.unpackedMessage.dataElements[38] ? this.unpackedMessage.dataElements[38] : accessResponse ? accessResponse['f38'] : null,
            handlerResponseTime: new Date,
            write2pos : '00',
            FIIC : Util.getFIIC(this.unpackedMessage),


            tamsBatchNo: this.transactionDetails.tamsBatchNo || "",
            tamsTransNo: this.transactionDetails.tamsTransNo || "",
            tamsStatus: this.transactionDetails.tamsStatus || "",
            tamsMessage: this.transactionDetails.tamsMessage || "",
            tamsRRN: this.transactionDetails.tamsRRN || "",

            handlerUsed: this.handlerUsed,
            interSwitchResponse: this.transactionDetails.interSwitchResponse || '',
            upslTerminalIdUsed: this.transactionDetails.upslTerminalIdUsed || ''

        }

        // transactionDetails after process
        this.transactionDetails = {
            ...this.transactionDetails,
            ...updateDetails
        };

        // let transactionID = this.handlingModelInstance.id;

        // console.log(this.transactionDetails);
        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),JSON.stringify(this.transactionDetails));

        let updated = false;

        await this.handlingModelInstance.set(updateDetails).save()
            .then(() => {

                console.log(`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);

                updated = true;

            })
            .catch((error) => {

                console.error(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);

                EmailNotifier.sendCriticalErrorAlert(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);

            });

        return updated;

    }

    async updateNoResponseTransaction(/** resCode */ messageReason) {
        let updateDetails = {
            handlerUsed: this.handlerUsed,
            handlerResponseTime: new Date,
            responseCode: '99',
            messageReason: messageReason
        }

        // transactionDetails after process
        this.transactionDetails = {
            ...this.transactionDetails,
            ...updateDetails
        };

        console.log(this.transactionDetails);

        let updated = false;

        await Journal.updateOne({
                terminalId: this.transactionDetails.terminalId,
                rrn: this.transactionDetails.rrn,
                STAN: this.transactionDetails.STAN,
                maskedPan: Util.getMaskPan(this.unpackedMessage)
            }, {
                $set: updateDetails
            })
            .then(() => {

                console.log(`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);

                updated = true;

            })
            .catch((error) => {

                console.error(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                EmailNotifier.sendCriticalErrorAlert(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);

            });

        return updated;

    }

    async sendTransactionRequest(unpackedMessage){
        //if the current time of the day has passed 12pm. and 12 to Field 7,12
        // MMDDhhmmss
        let dateField = new Date();
        let MM = dateField.getMonth() + 1;
        let DD = dateField.getDate();
        let hh = dateField.getHours();
        let mm = dateField.getMinutes();
        let ss = dateField.getSeconds();

        MM = (MM > 9) ? `${MM}` : `0${MM}`;
        DD = (DD > 9) ? `${DD}` : `0${DD}`;
        hh = (hh > 9) ? `${hh}` : `0${hh}`;
        mm = (mm > 9) ? `${mm}` : `0${mm}`;
        ss = (ss > 9) ? `${ss}` : `0${ss}`;

        // let field7 = parseInt(unpackedMessage.dataElements['7'].slice(4,6));
        // Hhmmss
        // let field11 = parseInt(unpackedMessage.dataElements['12'].slice(0,2));
        let requestBody = {
            configKey: process.env.ACCESS_REROUTE_CONFIG_KEY,
            mti: unpackedMessage.mti,
            f2: unpackedMessage.dataElements['2'],
            f3: unpackedMessage.dataElements['3'],
            f4: unpackedMessage.dataElements['4'],
            //Transmission time
            // f7: unpackedMessage.dataElements['7'],
            f7: `${MM}${DD}${hh}${mm}${ss}`,
            f11: unpackedMessage.dataElements['11'],
            //Time, Local Transaction
            // f12: unpackedMessage.dataElements['12'],
            f12: `${hh}${mm}${ss}`,
            f13: unpackedMessage.dataElements['13'],
            f14: unpackedMessage.dataElements['14'],
            f18: unpackedMessage.dataElements['18'],
            f22: unpackedMessage.dataElements['22'],
            f23: unpackedMessage.dataElements['23'],
            f25: unpackedMessage.dataElements['25'],
            f26: unpackedMessage.dataElements['26'],
            f28: unpackedMessage.dataElements['28'],
            f32: unpackedMessage.dataElements['32'],
            f35: unpackedMessage.dataElements['35'],
            f37: unpackedMessage.dataElements['37'],
            f40: unpackedMessage.dataElements['40'],
            f41: unpackedMessage.dataElements['41'],
            f42: unpackedMessage.dataElements['42'],
            f43: unpackedMessage.dataElements['43'],
            f49: unpackedMessage.dataElements['49'],
            f52: unpackedMessage.dataElements['52'] ? unpackedMessage.dataElements['52'] : null,
            // f52: unpackedMessage.dataElements['52'] ? null : null,
            f55: unpackedMessage.dataElements['55'],
            f59: unpackedMessage.dataElements['59'],
            f123: unpackedMessage.dataElements['123'],
            f128: unpackedMessage.dataElements['128'],
        }

        console.log('reqbody sent', requestBody);
        Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),`Sent to Access DCR` + JSON.stringify(requestBody));

        return axios.post(`${process.env.ACCESS_REROUTE_BASE_URL}/rest-service/process/super-agent`, JSON.stringify(requestBody), {
            headers: {
            'Content-Type': 'application/json',
            }, 
            timeout: 90000
        })
        .then((response) => {
            // console.log('at 1st layer',response);
            return response;
        })
        .catch((error) => {
            console.log('error at sending request',error.message);
            Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),`Error occured at Access DCR` + JSON.stringify(error));
            return error;
        });
    }

    /**
     * 
     * @param {*} unpackedMsg Initial Unpacked Message from POS
     * @param {*} response Response from APT PAY - Access
     * @param {*} terminalKeys terminalKeys for this TID
     * @returns 
     */
    buildIsoResponseforAccessDCR(unpackedMsg, response, terminalKeys) {

    //   dataElements128[0] = '0210';
      dataElements128[2] = unpackedMsg.dataElements[2];
      dataElements128[3] = unpackedMsg.dataElements[3];
      dataElements128[4] = unpackedMsg.dataElements[4];
      dataElements128[7] = unpackedMsg.dataElements[7];
      dataElements128[11] = unpackedMsg.dataElements[11];
      dataElements128[12] = unpackedMsg.dataElements[12];
      dataElements128[13] = unpackedMsg.dataElements[13];
      dataElements128[14] = unpackedMsg.dataElements[14];
      dataElements128[18] = unpackedMsg.dataElements[18];
      dataElements128[22] = '051';
      dataElements128[23] = unpackedMsg.dataElements[23];
      dataElements128[25] = '00';
      dataElements128[28] = 'C00000000';
      dataElements128[32] = response.data['f32'];
      dataElements128[33] = null;
      dataElements128[35] = unpackedMsg.dataElements[35];
      dataElements128[37] = unpackedMsg.dataElements[37];
      dataElements128[39] = response.data['f39'];
  //  dataElements128[39] = response.responseCode === '00' ? '00' : '91';
      dataElements128[40] = unpackedMsg.dataElements[40];
      dataElements128[41] = unpackedMsg.dataElements[41];
      dataElements128[42] = unpackedMsg.dataElements[42];
      dataElements128[43] = unpackedMsg.dataElements[43];
      dataElements128[49] = '566';
  
  //  dataElements128[52] = unpackedMsg.dataElements[52] ? unpackedMsg.dataElements[52] : null;
      dataElements128[52] = null;
  
      dataElements128[55] = unpackedMsg.dataElements[55];
      dataElements128[59] = unpackedMsg.dataElements[59];
      dataElements128[123] = unpackedMsg.dataElements[123];
      dataElements128[128] = '0000000000000000000000000000000000000000000000000000000000000000';
  
      const packedMessageWithout128 = this.iso8583Parser.pack('0210', dataElements128).isoMessage;
    //   terminalKeys = await TerminalKey.findTerminal(unpackedMsg.dataElements[41]);
      dataElements128[128] = this.calculateHashData(terminalKeys, packedMessageWithout128).toString();
      let packedIsoMessage = this.iso8583Parser.pack('0210', dataElements128).isoMessage;
    //   console.log('packed Message to POS', packedIsoMessage);
      let binLen = Util.getLengthBytes(packedIsoMessage.length);
      return Buffer.concat([binLen,Buffer.from(packedIsoMessage,"utf8")]);
    }
  
  
    calculateHashData(terminal, message) {
    //   console.log('terminalkey Passed', terminal);
      let decryptedSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1,terminal.masterKey_1,"1");
      const hashMessage = Util.doSha256(decryptedSessionKey, message);
      return hashMessage.toUpperCase();
    }

    calculateAccessDCRPinblock(pinBlock, terminalKey) {
        // console.log('Old PINBLOCK', pinBlock);
        let nibssPinkey = ExtractKeys.getDecryptedPinKey(terminalKey.pinKey_1,terminalKey.masterKey_1,1);
        // console.log('decrypted PINkey from NIbss', nibssPinkey);
        let clearPinblock = Util.decrypt3DES(pinBlock,"hex",nibssPinkey,"hex","hex");
        // console.log(`clear pin from NIBSS ${clearPinblock}`);
        // Get their Clear PINKEY using XOR COMPONENT KEYS
    
        // let accessPinkey  = ExtractKeys.getDecryptedAccessPinKey(process.env.ACCESS_ROUTE_ZPK, 1);
        let componentKeys = Util.xorAccessRoutingComponentKey(1);
        // console.log('Raw component keys', componentKeys);
        // console.log('Component Keys', componentKeys.toString('hex').toUpperCase());
        let accessPinblock = Util.encrypt3DES(clearPinblock,"hex",componentKeys.toString('hex').toUpperCase(),"hex","hex");
        console.log(`access new pinblock: ${accessPinblock}`);
        return accessPinblock;
    }

    afterTransactionProcess(response, terminalKeys){
        // let terminalKeys = await TerminalKey.findTerminal(unpackedMessage.dataElements[41]);
        // this.buildIsoResponseforAccessDCR(this.unpackedMessage,response, terminalKeys);
        
        if(response.data['f39'] !== "00"){
            //Handle when not successful at Apt Pay.
            console.log('response from Access', this.buildIsoResponseforAccessDCR(this.unpackedMessage, response, terminalKeys));
            this.socketConnection.write(this.buildIsoResponseforAccessDCR(this.unpackedMessage, response, terminalKeys));
            //TODO Notify the merchant.
            this.socketConnection.end();
            return;
        }
        this.socketConnection.write(this.buildIsoResponseforAccessDCR(this.unpackedMessage, response, terminalKeys));
        this.socketConnection.end();
        this.handlerEvent.emit('complete', this.handlingModelInstance, this.transactionDetails);
        // this.handlerEvent.emit('e-receipt', this.receiptData, this.transactionDetails);
    }

    /**
     * send and await soocket message.
     * @param {String} reqMsg iso request message
    */
    async sendSocketData(reqMsg){

        let socketclient = new SocketClient(this.FAILOVER_IP,this.FAILOVER_PORT,true);
        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Routing To Failover` + JSON.stringify(reqMsg.toString().substr(2)));
        let socketHandler = socketclient.startClient(reqMsg);
        let self = this;
        return new Promise(
            function (resolve, reject) {
                socketHandler.on('data', data => {
                    console.log(`Access TAMS Failover response : ${data.toString('HEX')}`)
                    resolve(data);
                });
                socketHandler.on('error', err => {
                    console.log(`Access tams error: ${JSON.stringify(err)}`)
                    reject(err);
                });
            });
    }
 
 }
 
 module.exports = AccessRerouteHandler;
 