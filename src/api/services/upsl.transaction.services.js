const dataElements128 = require('../config/dataelements');
// const transactionServices = require("../../helpers/Util");
const Util = require("../../helpers/Util");
const SocketClient = require("../../socket/socketclient");
const TerminalKey = require('../../model/terminalkeysModel');
const ExtractKey = require('../../helpers/ExtractKeys');
const cISO8583 = require('../../ciso8583/CISO');
const Journal = require("../../model/journalmodel");
// const TransactionEvent = require('../../events/transactionevent');
const EmailNotifier = require('../../notifications/notifiers/emailnotifier');

class UpslTransactionServices {

    constructor(payload) {

        this.Ip = process.env.UPSL_IP;
        this.Port = process.env.UPSL_PORT;
        this.requestData = {};
        this.handlerUsed = Util.handlers.upsl;
        this.handlerName = Util.handlers.upsl;

        this.iso8583Parser = new cISO8583();
        this.terminalKeys = {};
        this.unpackedReqMessage = '';
        this.handlingModelInstance 

        this.payload = payload;

        this.handlingModel = Journal;

    }

    /**
     * 
     *  {MTI, amount, pinblock, icc, track2Data, payAttitudeData, 
     * terminalId, processingCode, stan, rrn, dataCode(F123), customRefData,
     * merchantCategoryCode, merchantId, merchantAddress }
     */
    async process() {
        try {
            
            //extract pan, service code and expirydate from track2data

            console.log("complete payload data", this.payload);

            const { expiryDate, restrictionCode, pan } = Util.extractCardDatafromTrack2(this.payload.track2Data);
            this.requestData = { ...this.payload, expiryDate, restrictionCode, pan };


            console.log("request data, " , this.requestData);

            this.terminalKeys = await this.getTerminalKeys(this.requestData.terminalId);

            if(!this.terminalKeys) {

                return false;

            }

        
            const isomessage = this.prepareISORequest();

            let initialSave = await this.saveInitialTransaction();


            console.log("initial save response" , initialSave);

            if (initialSave === false) {

                response.error = true;
                response.message = "Unable to save initial transaction, aborting";

                console.error(`There was an error saving the initial transaction, aborting`);
                EmailNotifier.sendCriticalErrorAlert("There was an error saving the initial transaction, aborting");
            }

            console.log("iso message: ", isomessage.toString());

            let response = await this.sendSocketData(isomessage);

            console.log("ISO Response: ", response);
            console.log("RESPONSE DATA, ", JSON.stringify(this.iso8583Parser.unpack(response.toString().substr(2))));
            // reversal test with UP
            return response;

        } catch (error) {

            console.log(`error processing transaction with UPSL for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error processing transaction with UPSL for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
            
        }

    }

    async handle() {

        const response = await this.process();

        if(response) {

            this.unpackedHandlingServerMessage = this.iso8583Parser.unpack(response.toString().substr(2));
            this.saveDetails.upslResponse = Util.getResponseCode(this.unpackedHandlingServerMessage);

        }


        let initialSaveUpdate = response !== false 
            ? await this.updateSavedTransaction() 
            : await this.updateNoResponseTransaction("99", Util.getNibssResponseMessageFromCode("99"));

        if (initialSaveUpdate === false) {

            console.error(`There was an error updating the initially saved transaction, aborting`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedReqMessage), `There was an error updating the initially saved transaction, aborting`);
    
        }

       //  this.handlerEvent.emit('complete', this.handlingModelInstance, this.saveDetails);



        return response !== false ? {
            rrn: this.saveDetails.rrn,
            messageReason: this.saveDetails.messageReason,
            responseCode: this.saveDetails.responseCode,
            authCode: this.saveDetails.authCode || null,
            handlerResponseTime: this.saveDetails.handlerResponseTime,
            payAttitudeData: this.unpackedHandlingServerMessage.dataElements[62] || null
        } : {
            rrn: this.saveDetails.rrn,
            messageReason: this.saveDetails.messageReason,
            responseCode: this.saveDetails.responseCode,
            authCode: null,
            handlerResponseTime: this.saveDetails.handlerResponseTime,
            payAttitudeData: this.unpackedHandlingServerMessage.dataElements[62] || null
        };

    }

    prepareISORequest() {

     let packedMessage = '';

    //  let MTI = Util.prepareUpslMTI(this.requestData.requestType);

      let pan = this.requestData.pan || null;

       this.requestData.payAttitudeData = Util.changeF60ID(this.requestData.payAttitudeData);

      dataElements128[0] = this.requestData.mti;
      dataElements128[2] = this.requestData.requestType === "nameInquiry" ? null : pan;
      dataElements128[3] = this.requestData.processingCode || null;
      dataElements128[4] = Util.prepareAmoutForIso(this.requestData.amount);
      dataElements128[7] = Util.formatTimestampForIsoRequest().dateFormat + Util.formatTimestampForIsoRequest().timeFormat;
      dataElements128[11] = this.requestData.stan || null;
      dataElements128[12] = Util.formatTimestampForIsoRequest().timeFormat;
      dataElements128[13] = Util.formatTimestampForIsoRequest().dateFormat;
      dataElements128[14] = this.requestData.expiryDate || null;
      dataElements128[18] = "0000";
      dataElements128[22] = '051';
      dataElements128[23] = "000";
      dataElements128[25] = '00';
      dataElements128[26] = '04';
      dataElements128[28] = 'D00000000';
      dataElements128[32] = this.requestData.pan.substring(0, 6);
      dataElements128[35] = this.requestData.track2Data || null;
      dataElements128[37] = this.requestData.rrn || null;
      dataElements128[40] = "221";
      dataElements128[41] = this.requestData.terminalId || null;
      dataElements128[42] = this.requestData.payAttitudeData !== undefined 
      ? process.env.UPSL_PAYATTITUDE_MERCHANT_ID 
      : this.requestData.merchantId || null;
      dataElements128[43] = this.terminalKeys.upslKey.PARAM["52040"].substring(0, 40);
      console.log("F43: ", dataElements128[43]);
      dataElements128[49] = '566'; 

      dataElements128[52] = this.requestData.pinblock === undefined || this.requestData.pinblock === null
        ? null : this.calculateUpPinblock(this.requestData.pinblock);

      dataElements128[55] = this.requestData.icc || null; 
      //check for customer ref data
      dataElements128[59] = null; 
      dataElements128[60] = this.requestData.requestType === "nameInquiry" ? null
        : this.requestData.payAttitudeData;
      dataElements128[62] = this.requestData.requestType === "nameInquiry" 
       ? this.requestData.payAttitudeData
       : Util.getF62ValueForPayAttitude(this.requestData.requestType,
        this.requestData.payAttitudeData); 
      dataElements128[103] = process.env.PAYATTITUDE_UNIQUE_IDENTIFIER;

      dataElements128[123] = this.requestData.dataCode;
      dataElements128[128] = '0000000000000000000000000000000000000000000000000000000000000000';

      console.log("dataElements128 => ", dataElements128)

      let packedMessageWithout128 = this.iso8583Parser.pack(this.requestData.mti, dataElements128);

      console.log("Packed Message w/128:", packedMessageWithout128)

      const packedMessageWithou128Str = `${packedMessageWithout128.mti}${packedMessageWithout128.hexadecimalBitmap.substring(0, 32)}${packedMessageWithout128.dataElementPart}`;

        console.log("Packed Message w/128 and Str", packedMessageWithou128Str)

      dataElements128[128] = this.calculateHashData(this.terminalKeys, packedMessageWithou128Str.slice(0, -64)).toString();

      packedMessage =  this.iso8583Parser.pack(this.requestData.mti, dataElements128);
      console.log("Packed::", packedMessage);
      const packedMessageStr = `${packedMessage.mti}${packedMessage.hexadecimalBitmap.substring(0, 32)}${packedMessage.dataElementPart}`;
      this.unpackedReqMessage =  this.iso8583Parser.unpack(packedMessageStr);
      console.log("Unpacked::", this.unpackedReqMessage);

      if(process.env.APP_ENV === 'local') {
          console.log(this.unpackedReqMessage);
      }

      let length = Util.getLengthBytes(packedMessageStr.length);
      return Buffer.concat([length, Buffer.from(packedMessageStr, "utf8")]);
    }

    async saveInitialTransaction() {

        this.saveDetails = {
            rrn: this.unpackedReqMessage.dataElements[37],
            onlinePin: (this.unpackedReqMessage.dataElements[52] !== null ? true : false),
            merchantName: this.unpackedReqMessage.dataElements[43].substring(0, 22),
            merchantAddress: this.unpackedReqMessage.dataElements[43].substring(23),
            merchantId: this.unpackedReqMessage.dataElements[42],
            terminalId: this.unpackedReqMessage.dataElements[41],
            STAN: this.unpackedReqMessage.dataElements[11],
            transactionTime: new Date(),
            merchantCategoryCode: this.unpackedReqMessage.dataElements[18],
            handlerName: this.handlerName,
            MTI: this.unpackedReqMessage.mti,
            maskedPan: this.unpackedReqMessage.dataElements[2] !== null 
                ? this.unpackedReqMessage.dataElements[2].substr(0, 6) + ''.padEnd(this.unpackedReqMessage.dataElements[2].length - 10, 'X') + this.unpackedReqMessage.dataElements[2].slice(-4) 
                : null,
            processingCode: this.unpackedReqMessage.dataElements[3],
            amount: parseInt(this.unpackedReqMessage.dataElements[4]),
            currencyCode: this.unpackedReqMessage.dataElements[49],
            messageReason: this.unpackedReqMessage.dataElements[56],
            originalDataElements: this.unpackedReqMessage.dataElements[90],
            customerRef: this.unpackedReqMessage.dataElements[59] || ""
        }

        console.log("this.saveDetails => ", this.saveDetails);
        
        this.handlingModelInstance = new this.handlingModel(this.saveDetails);

        let saved = false;

        await this.handlingModelInstance.save().then(() => {

                console.log(`Saved Transaction from Terminal: ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedReqMessage),`Saved Transaction from Terminal: ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}`);

                saved = true;

            })
            .catch((error) => {

                console.error(`Exception Saving ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedReqMessage),`Exception Saving ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);

                EmailNotifier.sendCriticalErrorAlert(`Exception Saving ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);

            });

        return saved;
    } 

    async updateSavedTransaction() {
        let updateDetails = {
            messageReason: Util.getNibssResponseMessageFromCode(this.unpackedHandlingServerMessage.dataElements[39]),
            failOverRrn: Util.getFailOverRRN(this.unpackedReqMessage, this.unpackedHandlingServerMessage),
            oldResCode: this.saveDetails.oldResCode ? this.saveDetails.oldResCode : '',
            responseCode: this.unpackedHandlingServerMessage.dataElements[39],
            script: this.unpackedHandlingServerMessage.dataElements[55],
            authCode: this.unpackedHandlingServerMessage.dataElements[38] ? this.unpackedHandlingServerMessage.dataElements[38] : this.saveDetails.authCode,
            handlerResponseTime: new Date,
            write2pos : '00',
            FIIC : Util.getFIIC(this.unpackedHandlingServerMessage),


            tamsBatchNo: this.saveDetails.tamsBatchNo || "",
            tamsTransNo: this.saveDetails.tamsTransNo || "",
            tamsStatus: this.saveDetails.tamsStatus || "",
            tamsMessage: this.saveDetails.tamsMessage || "",
            tamsRRN: this.saveDetails.tamsRRN || "",

            handlerUsed: this.handlerUsed,
            interSwitchResponse: this.saveDetails.interSwitchResponse || ''

        }

        // transactionDetails after process
        this.saveDetails = {
            ...this.saveDetails,
            ...updateDetails
        };

        console.log("Saved Details::", this.saveDetails);
        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedHandlingServerMessage),JSON.stringify(this.saveDetails));

        let updated = false;

        await this.handlingModelInstance.set(updateDetails).save()
            .then(() => {

                console.log(`Updated Transaction from Terminal: ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedHandlingServerMessage),`Updated Transaction from Terminal: ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}`);

                updated = true;

            })
            .catch((error) => {

                console.error(`Exception Updating ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedReqMessage),`Exception Updating ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);

                EmailNotifier.sendCriticalErrorAlert(`Exception Updating ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);

            });


        console.log("updated response", updated);

        return updated;

    }

    async updateNoResponseTransaction(resCode, messageReason) {
        let updateDetails = {
            handlerUsed: this.handlerUsed,
            handlerResponseTime: new Date,
            responseCode: resCode,
            messageReason: messageReason
        }

        // transactionDetails after process
        this.transactionDetails = {
            ...this.saveDetails,
            ...updateDetails
        };

        console.log(this.transactionDetails);

        let updated = false;

        await Journal.updateOne({
                terminalId: this.saveDetails.terminalId,
                rrn: this.saveDetails.rrn,
                STAN: this.saveDetails.STAN,
                maskedPan: Util.getMaskPan(this.unpackedReqMessage)
            }, {
                $set: updateDetails
            })
            .then(() => {

                console.log(`Updated Transaction from Terminal: ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedReqMessage),`Updated Transaction from Terminal: ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}`);

                updated = true;

            })
            .catch((error) => {

                console.error(`Exception Updating ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedReqMessage),`Exception Updating ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);
                EmailNotifier.sendCriticalErrorAlert(`Exception Updating ${this.saveDetails.terminalId}, with RRN: ${this.saveDetails.rrn}, Exception ${error}`);

            });

        return updated;

    }

    /**
     * send and await soocket message.
     * @param {String} reqMsg iso request message
     */
    async sendSocketData(reqMsg){

        console.log("UPSL REQUEST DATA, ", reqMsg);

        console.log(`upsl-req : ${reqMsg.toString("HEX")}`)
        let socketclient = new SocketClient(this.Ip,this.Port,false);
        let socketHandler = socketclient.startClient(reqMsg, 20000);

        let self = this;
        return new Promise(
            function (resolve, reject) {
                socketHandler.on('data', data => {
                    console.log(`upsl response : ${data.toString('HEX')}`)
                    resolve(data);
                });
                socketHandler.on('error', err => {
                    console.log(`upsl : ${err}`)
                    reject(err);
                });
            }

        );
    }

    async getTerminalKeys(terminalId) {

        let terminal = await TerminalKey.findTerminal(terminalId);
        console.log("Terminal:", terminal);
        if (!terminal) return false;

        console.log("log upslKy", terminal.upslKey)

        if(terminal.upslKey === null) return false;

        return terminal;


    }

    calculateUpPinblock(pinBlock, terminal) {

        let nPinkey = ExtractKey.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1,1);
        let clearPinblock = Util.decrypt3DES(pinBlock,"hex",nPinkey,"hex","hex");
        console.log(`clear pin ${clearPinblock}`)

        let uPinkey  = ExtractKey.getDecryptedPinKey(terminal.upslKey.TPK,terminal.upslKey.TMK,"up");
        let upPinblock = Util.encrypt3DES(clearPinblock,"hex",uPinkey,"hex","hex");

        console.log(`up pin: ${upPinblock}`);
        return upPinblock;

    }

    calculateHashData(terminal, message) {
        let decryptedSessionKey = ExtractKey.getDecryptedSessionKey(terminal.upslKey.TSK,terminal.upslKey.TMK,"up");
        const hashMessage = Util.doSha256(decryptedSessionKey, message);

        console.log("final hash", hashMessage);
        return hashMessage.toUpperCase();
    }



}

module.exports = UpslTransactionServices;