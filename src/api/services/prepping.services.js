// const dataElements128 = require('../config/dataelements');
const dataElements64 = require('../config/dataelements_64');
// const transactionServices = require("../../helpers/Util");
const Util = require("../../helpers/Util");
const SocketClient = require("../socket/socketClient");
const TerminalKey = require('../../model/terminalkeysModel');
const ExtractKey = require('../../helpers/ExtractKeys');
const cISO8583 = require('../../ciso8583/CISO');
const Journal = require("../../model/journalmodel");
// const TransactionEvent = require('../../events/transactionevent');
const EmailNotifier = require('../../notifications/notifiers/emailnotifier');
const {randomString, parseField62} = require('../helpers/utils');
const moment = require('moment');

class PreppingServices {

    constructor(payload) {
        this.Ip = process.env.NIBSS_IP;
        this.Port = process.env.NIBSS_PORT;
        this.CALLHOME_IP = process.env.CALLHOME_IP;
        this.CALLHOME_PORT = process.env.CALLHOME_PORT;
        this.requestData = {};
        this.handlerName = "NIBSS " + process.env.handler;
        this.handlerUsed = process.env.handler;
        this.iso8583Parser = new cISO8583();
        this.terminalKeys = {};
        this.unpackedReqMessage = '';
        this.payload = payload;
        this.handlingModel = Journal;
    }

    /**
     * 
     * the endpoint receives payload = {amount, pinblock, icc, track2Data, 
     * terminalId, processingCode, stan, rrn, dataCode(F123), customRefData,
     * merchantCategoryCode, merchantId, merchantAddress }
     * 
     */
    async process() {

        try {
            let response = false;
            //extract pan, service code and expirydate from track2data
            // const { expiryDate, restrictionCode, pan } = Util.extractCardDatafromTrack2(this.payload.track2data);
            this.requestData = { ...this.payload };

            const isomessage = this.prepareNetworkISORequest().isoMessage;
            console.log(isomessage, 'after preparing ISO message at process');
            response = await this.sendSocketData(isomessage);
            if(!response){
                return false;
            }

            return response;
            // if(process.env.APP_ENV === 'local') {
            //     console.log(this.unpackedReqMessage);
            // }
            // return packedMessageStr;
        } catch (error) {
            console.log(`error processing transaction with UPSL for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error processing transaction with UPSL for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }

    }

    async handle() {

        //Response can either be false or unpacked Message response
        const response = await this.process();

        let handlingServerResponse = '';
        handlingServerResponse += response.toString('hex');
            if(handlingServerResponse.length < 4) return false;

            let length = Number.parseInt(handlingServerResponse.substr(0,4),16);
            let handlingData = Buffer.from(handlingServerResponse.substr(4),'hex').toString('utf8');
            if(handlingData.length < length) return false;

        console.log("RESPONSE DATA, ", JSON.stringify(this.iso8583Parser.unpack(response.toString().substr(2))));
        // ** Remember Change the format of response to the people....

        let unpackedResponse = this.iso8583Parser.unpack(handlingData);

        let processingCode = Util.getProcessingCode(unpackedResponse);
        let terminalId = Util.getTerminalId(unpackedResponse);
        ExtractKey.getTerminalKey(terminalId, unpackedResponse, processingCode, 1);

        if(unpackedResponse) {
            return unpackedResponse;
            // return this.formatResponse(unpackedResponse)
        }

        // return response !== false ? {
        //     rrn: this.saveDetails.rrn,
        //     messageReason: this.saveDetails.messageReason,
        //     responseCode: this.saveDetails.responseCode,
        //     authCode: this.saveDetails.authCode,
        //     handlerResponseTime: this.saveDetails.handlerResponseTime
        // } : {
        //     rrn: this.saveDetails.rrn,
        //     messageReason: this.saveDetails.messageReason,
        //     responseCode: this.saveDetails.responseCode,
        //     authCode: null,
        //     handlerResponseTime: this.saveDetails.handlerResponseTime
        // };
    }

    leftFillNum(num, targetLength) {
        return num.toString().padStart(targetLength, 0);
    }

    rightFillNum(value, targetLength){
        return value.toString().padEnd(targetLength, ' ');
    }

    buildCallHomeData(){
        let callhomedata = {
            "ptad":"ITEX INTEGRATED SERVICES",
            "serial": this.payload.serialNo,
            "ctime": moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
            "bl": this.payload.callhomeData.bl || "",
            "cs": this.payload.callhomeData.cs || "Not Charging",
            "ps": this.payload.callhomeData.ps || "PrinterOK",
            "tid": this.payload.terminalId || "",
            "mid": this.payload.callhomeData.mid || "",
            "coms": this.payload.callhomeData.coms || "GPRS",
            "ss": this.payload.callhomeData.ss,
            "cloc":
            {
                "cid": this.payload.callhomeData.cloc.cid || "",
                "lac": this.payload.callhomeData.cloc.lac || "",
                "mcc": this.payload.callhomeData.cloc.mcc || "",
                "mnc":this.payload.callhomeData.cloc.mnc || "",
                "ss":this.payload.callhomeData.ss || ""
            },
            "sim":this.payload.callhomeData.sim || "",
            "tmn": this.payload.callhomeData.tmn || "",
            "tmanu": this.payload.callhomeData.tmanu || "PAX",
            "hb": this.payload.callhomeData.hb || "true",
            "sv": this.payload.callhomeData.sv || "",
            "build": this.payload.callhomeData.build || "",
            "lTxnAt": this.payload.callhomeData.lTxnAt || "",
            "pads": this.payload.callhomeData.pads || ""
        }
        return callhomedata;
    }

    buildCallHomeField62(callhomeData){
        const result = `01` + this.leftFillNum(this.payload.serialNo.length, 3) + `${this.payload.serialNo}` + 
        `09` + `003`+`${callhomeData.appVersion}` + 
        `10` + `020` + this.rightFillNum(callhomeData.paymentMode, 20) + 
        `11` + `${this.leftFillNum(JSON.stringify(this.buildCallHomeData()).length, 3)}` + JSON.stringify(this.buildCallHomeData()) +
        `12` + `${this.leftFillNum(callhomeData.commServiceProvider.length, 3)}` + callhomeData.commServiceProvider;
        console.log('result', `${result.length}` + result);
        // return `${result.length}` + result;
        return result;
        // "010083K423952090030.110020PAX S90 GPRS        11363{\"ptad\":\"ITEX INTEGRATED SERVICES\",\"serial\":\"3K423952\",\"ctime\":\"2022-12-02 15:07:17\",\"bl\":75,\"cs\":\"Not Charging\",\"ps\":\"PrinterOK\",\"tid\":\"2035PZ03\",\"mid\":\"2035LA072024179\",\"coms\":\"GPRS\",\"ss\":\"100\",\"cloc\":{\"cid\":\"\",\"lac\":\"\",\"mcc\":\"\",\"mnc\":\"\",\"ss\":\"\"},\"sim\":\"\",\"tmn\":\"S90\",\"tmanu\":\"PAX\",\"hb\":\"true\",\"sv\":\"7.9.15\",\"build\":\"1\",\"lTxnAt\":\"2022-12-01 13:14:41\",\"pads\":\"\"}12021621300392893228"
    }

    formatResponse(unpackedResponse){
        // moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
        let formatted = {
            "country_code": "566",
            "datetime": unpackedResponse.dataElements[7],
            "pin_key": "37455D162C68D01CA4E9D5A4C1B32F3B",
            "merchantid": "2058LA019661700",
            "response": unpackedResponse.dataElements[39],
            "merchant_category_code": "5072",
            "description": "Prep Successful",
            "terminalid": unpackedResponse.dataElements[41],
            "merchant_address": "TELIX SOLUTIONS LILA  LANG",
            "currency_code": "566",
            "timeout": "45"
        }

    }

    prepareNetworkISORequest(processingCode, key = null) {
        let isoMsg = null;
      dataElements64[3] = processingCode;
      dataElements64[7] = Util.formatTimestampForIsoRequest().dateFormat + Util.formatTimestampForIsoRequest().timeFormat;
      dataElements64[11] = randomString();
      dataElements64[12] = Util.formatTimestampForIsoRequest().timeFormat;
      dataElements64[13] = Util.formatTimestampForIsoRequest().dateFormat;
      dataElements64[41] = this.payload.terminalId;
      dataElements64[62] = processingCode.slice(0,2) === '9C' ? 
      `01` + this.leftFillNum(this.payload.serialNo.length, 3) + `${this.payload.serialNo}` : 
      processingCode.slice(0,2) === '9D' ? this.buildCallHomeField62({
          appVersion: this.payload.appVersion,
          paymentMode: this.payload.paymentMode,
          commServiceProvider: this.payload.commServiceProvider
        }) : null;
        console.log(dataElements64, 'dataElements64 sent>>>>>');
      isoMsg = this.iso8583Parser.pack('0800', dataElements64).isoMessage;

      if(key || (processingCode.slice(0,2) === '9D')){
        dataElements64[64] = Util.signIsoMessage(key,isoMsg).toUpperCase();
        isoMsg = this.iso8583Parser.pack('0800', dataElements64).isoMessage;
      }
      console.log(isoMsg, 'iso Message sent');
        let binLen = Util.getLengthBytes(isoMsg.length);
        return Buffer.concat([binLen,Buffer.from(isoMsg,"utf8")]);
    }


    async updateNoResponseTransaction(resCode, messageReason) {
        console.log("No response received for Network Message");
        let updateDetails = {
            handlerUsed: this.handlerUsed,
            handlerResponseTime: new Date,
            responseCode: resCode,
            messageReason: messageReason
        }

        let updated = false;
        return updated;
    }

    /**
     * send and await soocket message.
     * @param {String} reqMsg iso request message
     */
    async sendSocketData(reqMsg, reRouteCondition){
        console.log("sent REQUEST DATA, ", reqMsg.toString());
        // console.log(`upsl-req : ${reqMsg.toString("HEX")}`)
        let socketclient = null
        if(reRouteCondition === "9D0000"){
            // console.log('passing through reroute condition....');
            socketclient = new SocketClient(this.CALLHOME_IP,this.CALLHOME_PORT,true);
            // console.log('socketClient Response')
        }else {
            socketclient = new SocketClient(this.Ip,this.Port,true);
        }
        
        let socketHandler = socketclient.startClient(reqMsg);
        let self = this;
        return new Promise(
            function (resolve, reject) {
                socketHandler.on('data', data => {
                    console.log(`prepping response : ${data.toString('utf-8')}`)
                    resolve(data);
                });
                // socketHandler.on('error', err => {
                //     console.log(`error sending to handler : ${err}`)
                //     reject(false);
                // });
                socketHandler.on('close', err => {
                    console.log(`socket client closed at Prepping : ${err}`)
                    reject(false);
                });
                // socketHandler.on('end', err => {
                //     console.log(`socket client ended :`)
                //     reject(false);
                // });
                socketHandler.on('timeout', () => {
                    console.log(`socket client timeout at Prepping`);
                    reject(false);
                });
            }

        );
    }

    // async getTerminalKeys(terminalId) {
    //     let terminal = await TerminalKey.findTerminal(terminalId);
    //     if (!terminal) return false;
    //     return terminal;
    // }

    calculateUpPinblock(pinBlock, terminal) {
        let nPinkey = ExtractKey.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1,1);
        let clearPinblock = Util.decrypt3DES(pinBlock,"hex",nPinkey,"hex","hex");
        console.log(`clear pin ${clearPinblock}`);

        let uPinkey  = ExtractKey.getDecryptedPinKey(terminal.upslKey.TPK,terminal.upslKey.TMK,"up");
        let upPinblock = Util.encrypt3DES(clearPinblock,"hex",uPinkey,"hex","hex");

        console.log(`up pin: ${upPinblock}`);
        return upPinblock;
    }

    calculateHashData(terminal, message) {
        let decryptedSessionKey = ExtractKey.getDecryptedSessionKey(terminal.upslKey.TSK,terminal.upslKey.TMK,"up");
        const hashMessage = Util.doSha256(decryptedSessionKey, message);
        return hashMessage.toUpperCase();
    }

    async prepTerminal(){
        //Encrypted Masterkey
        let TMK = await this.getMasterKey();
        if(!TMK) return;

        //Encrypted Session key
        let TSK = await this.getSessionKey();
        if(!TSK) return;

        //Encrypted PinKey
        let TPK = await this.getPinKey();
        if(!TPK) return;
        
        //Get decrypted Masterkey, 
        let key = ExtractKey.getDecryptedSessionKey(TSK,TMK,1);
        // console.log('Clear session key extract', key);

        let paramResponse = await this.getParameters(key);

        let param = Util.getConfigData(paramResponse);

        if(!param) return;

        let conf = {
            TMK : TMK,
            TPK : TPK,
            TSK : TSK,
            PARAM : param
        }

        //After doing paramter download then do callhome.

        console.log("NIBSS KEYS => ", JSON.stringify(conf));
        console.log("------------||----------------");

        // let callhome = await this.handleCallHome();
        //Code below works for node version 14 not for version 10
        // let paramDownloadDetails = Object.fromEntries(param);

        let merchantId = param.get('03015').slice(0,15);
        let merchantName = param.get('52040').substring(0, 40);
        // this.terminalKeys.upslKey.PARAM["52040"].substring(0, 40);

        //Decrypt the PINKEY, MASTERKEY, SESSIONKEY
        let clearPinKey = ExtractKey.getDecryptedPinKey(TPK,TMK,1);
        let clearSessionKey = ExtractKey.getDecryptedSessionKey(TSK,TMK,1);
        let clearMasterKey = ExtractKey.getDecryptedMasterKey(TMK, 1);

        let formatted = {
            "error": "false",
            "status": "success",
            "datetime": Date.now(),
            "country_code": "566",
            "pin_key": clearPinKey,
            "master_key": clearMasterKey,
            "session_key": clearSessionKey,
            "merchantId": merchantId,
            "merchantName": merchantName,
            "merchantCategoryCode": parseField62(paramResponse.dataElements[62])['08'],
            "terminalid": this.payload.terminalId,
            "serialNo": this.payload.serialNo,
            "response_message": 'Prepped successful',
        }
        // const hasUpdated = await TerminalKey.findOneAndUpdate({
        //     terminalId: this.payload.terminalId
        // }, 
        // {   masterKey_1: TMK,
        //     sessionKey_1: TSK,
        //     pinKey_1: TPK
        // });
        // if(!hasUpdated){
        //     console.error(`upsl-Error saving Prepping config, TID : ${this.payload.terminalId}`);
        //     return false;
        // }
        // console.log('has Updated', hasUpdated);
        // TerminalKey.update({terminalId : this.terminalId}, {$set : {upslKey : conf}},{upsert: true, setDefaultsOnInsert: true},(err,data)=>{
        //     if(err){
        //         console.error(`upsl-Error saving UPSL config, TID : ${this.terminalId}, ${err}`)
        //     }else{
        //         console.log(`UPSL config saved, TID : ${this.terminalId}`)   
        //     }
        // })
        return formatted;
        
    }

    async handleKeyExchange(){
        // const response = await this.handle();
        const response = await this.prepTerminal();
        // console.log('got response after prepping Tid', response);
        return response ? response : {error: true, message: 'Error occured during prepped'};
    }

    async getMasterKey(){
        try {
            let reqMsg = {};

            //Build dataElement fields.
            Object.assign(reqMsg, this.payload);
            // reqMsg["41"] = "20442R11";

            console.log("Prepping for MASTER KEY REQUEST => ", reqMsg)

            let isoMsg = this.prepareNetworkISORequest('9A0000');
            // console.log(isoMsg, 'iso result...');

            let response = await this.sendSocketData(isoMsg);
            // if(!response) {throw Error('Socket Timeout/Socket Error at Master key from Nibss')}

            let unpackedResponse = this.iso8583Parser.unpack(response.toString().substr(2));
            
            // console.log("Response MASTER KEY => ", unpackedResponse);
    
            return Util.getSecurityKey(unpackedResponse);
        } catch (error) {
            console.log(`error getting TMK for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error getting USPL TMK for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
            // return error;
        }
    }


    // UPSL_WITHDRAWAL_TERMINAL_IDS="2UP1T007,2UP1T008,2UP1T009,2UP1T010,2UP1T011,2UP1T012,2UP1T013"
    async getSessionKey() {
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.payload);

            console.log(reqMsg, 'passed payload for session key')
            let isoMsg = this.prepareNetworkISORequest('9B0000');
            // let isoMsg = ExtractKey.prepareISOmsg("0800", reqMsg, this.iso8583Parser);

            let response = await this.sendSocketData(isoMsg);
            // if(!response) {throw Error('Socket Timeout/Socket Error at Session Key from Nibss')}
            let unpackedResponse = this.iso8583Parser.unpack(response.toString().substr(2));

            // console.log("SESSION KEY RESPONSE => ", unpackedResponse);

            return Util.getSecurityKey(unpackedResponse);

        } catch (error) {
            console.log(`error getting USPL TSK for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error getting USPL TSK for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
            // return error;
        }
    }

    async getPinKey(){
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.payload);

            // reqMsg['3'] = "9G0000";
            // reqMsg["41"] = "20442R11";
            let isoMsg = this.prepareNetworkISORequest('9G0000');
            // let isoMsg = ExtractKey.prepareISOmsg("0800",reqMsg,this.ciso);

            let response = await this.sendSocketData(isoMsg);
            // if(!response) {throw Error('Socket Timeout/Socket Error at Pin Key from Nibss')}
            let unpackedResponse = this.iso8583Parser.unpack(response.toString().substr(2));
            
            // console.log("PIN KEY RESPONSE => ", unpackedResponse);

            return Util.getSecurityKey(unpackedResponse);

        } catch (error) {
            console.log(`error getting USPL TPK for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error getting USPL TPK for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
            // return error;
        } 
    }

    async getParameters(key){
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.payload);

            let isoMsg = this.prepareNetworkISORequest('9C0000', key);
            // console.log(isoMsg.toString(), 'message sent to socket server for param download???');
            // let isoMsg = ExtractKey.prepareISOmsg("0800", reqMsg, this.ciso, key);

            let response = await this.sendSocketData(isoMsg);
            // if(!response) {throw Error('Socket Timeout/Socket Error at Parameter downlaod from Nibss')}
            let unpackedResponse = this.iso8583Parser.unpack(response.toString().substr(2));
            
            // console.log("GET PARAMS RESPONSE => ", unpackedResponse);
            return unpackedResponse;
            // return Util.getConfigData(unpackedResponse);
        } catch (error) {
            console.log(`error getting Param Download for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error getting Param download for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            return false;
            // return error;
        }
    }

    async handleCallHome(){
        try{
            let reqMsg = {};
            //Build dataElement fields.
            Object.assign(reqMsg, this.payload);

                // JSON.stringify(callhomedata).length;

            console.log("Sending CallHome => ", reqMsg)
            const terminalKeys = await TerminalKey.findTerminal(this.payload.terminalId);
            console.log(terminalKeys, 'terminal Keys');
            let key = ExtractKey.getDecryptedSessionKey(terminalKeys.sessionKey_1,terminalKeys.masterKey_1,1);

            let isoMsg = this.prepareNetworkISORequest('9D0000', key);
            console.log(isoMsg, 'iso result...');

            let response = await this.sendSocketData(isoMsg, '9D0000');
            console.log(response, 'response');

            let unpackedResponse = this.iso8583Parser.unpack(response.toString().substr(2));
            
            console.log("Response Callhome Data =>", unpackedResponse);
    
            return Util.getSecurityKey(unpackedResponse);
        } catch (error) {
            console.log(`error at callhome for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error at callhome sending for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }
    }

}

module.exports = PreppingServices;