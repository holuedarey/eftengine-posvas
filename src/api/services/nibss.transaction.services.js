const dataElements128 = require('../config/dataelements');
const Util = require("../../helpers/Util");
const SocketClient = require("../../socket/socketclient");
const TerminalKey = require('../../model/terminalkeysModel');
const ExtractKey = require('../../helpers/ExtractKeys');
const cISO8583 = require('../../ciso8583/CISO');
const Journal = require("../../model/journalmodel");
const {randomString, padLeft, formatReversalAmount, generateCardTrack2Data} = require('../helpers/utils');


class TransactionServices {

    constructor(payload) {
        this.Ip = process.env.NIBSS_IP;
        this.Port = process.env.NIBSS_PORT;
        this.requestData = {};
        this.handlerName = "NIBSS " + process.env.handler;
        this.handlerUsed = process.env.handler;
        this.iso8583Parser = new cISO8583();
        this.terminalKeys = {};
        this.unpackedReqMessage = '';
        this.handlingModelInstance 
        this.payload = payload;
        this.handlingModel = Journal;
        this.transactionDetails = {};
        this.saveDetails = {};
    }

    getMonth(month){
        if(month === 'Jan'){
            return '01';
        }else if(month === 'Feb'){
            return '02';
        }else if(month === 'Mar'){
            return '03';
        }else if(month === 'Apr'){
            return '04';
        }else if(month === 'May'){
            return '05';
        }else if(month === 'Jun'){
            return '06';
        }else if(month === 'Jul'){
            return '07';
        }else if(month === 'Aug'){
            return '08';
        }else if(month === 'Sep'){
            return '09';
        }else if(month === 'Oct'){
            return '10';
        }else if(month === 'Nov'){
            return '11';
        }else if(month === 'Dec'){
            return '12';
        }
    }

    /**
     * 
     * the endpoint receives payload = {amount, pinblock, icc, track2Data, 
     * terminalId, processingCode, stan, rrn, dataCode(F123), customRefData,
     * merchantCategoryCode, merchantId, merchantAddress }
     * 
     */
    async process(mti) {
        
        try {
            let previousTransactionJournal;
            if(!this.payload.track2data || this.payload.track2data === undefined){
                //generate the requestData here for this case
                // previousTransactionJournal = await this.handlingModel.checkTimeoutTransaction({rrn: this.payload.rrn, terminalId: this.payload.terminalId, maskedPan: Util.getMaskPanByPan(this.payload.pan)});
                // console.log('journal stuff gotten', previousTransactionJournal);
                // if(!previousTransactionJournal){
                //     //Return the transaction didnt timeout.
                //     return false;
                // }
                // this.payload.track2data = generateCardTrack2Data(this.payload.pan, this.payload.restrictionCode, previousTransactionJournal.cardExpiry);
                // console.log('track 2 data generated', this.payload.track2data);

                // this.requestData = {
                //     ...this.payload,
                //     previousTransactionJournal: previousTransactionJournal,
                //     expiryDate: previousTransactionJournal.cardExpiry,
                //     customRefData: previousTransactionJournal.customerRef,
                // }
                // console.log('reversal data', this.requestData);

                
            }else{
                //extract pan, service code and expirydate from track2data
                const { expiryDate, restrictionCode, pan } = Util.extractCardDatafromTrack2(this.payload.track2data);
                
                if(this.payload.reversal){
                    previousTransactionJournal = await this.handlingModel.checkTimeoutTransaction({rrn: this.payload.rrn, terminalId: this.payload.terminalId, maskedPan: Util.getMaskPanByPan(pan)});
                    this.requestData = {
                        ...this.payload,
                        expiryDate, 
                        restrictionCode,
                        pan,
                        previousTransactionJournal: previousTransactionJournal,
                        expiryDate: previousTransactionJournal.cardExpiry,
                        customRefData: previousTransactionJournal.customerRef,
                    }
                }else{
                    this.requestData = { ...this.payload, expiryDate, restrictionCode, pan };
                }
            }

            console.log('at normal payload', this.requestData);
            this.terminalKeys = await this.getTerminalKeys(this.payload.terminalId);
            console.log('terminal keys', this.terminalKeys);
            const isomessage = await this.prepareISORequest(mti);
            console.log(isomessage, 'isomessage');
            let dateTImeCombination;
            
            if(previousTransactionJournal){
                dateTImeCombination = previousTransactionJournal.transactionTime.toString().split(' ');
                
                console.log('got here at dateTImeCombination To STRING', dateTImeCombination);
                                //originalMTI(4 characters) originalSTAN(6 characters) originalMMDDHHMMSS(10 characters) originalAIIC 00000000000
                                // transactionTime: 2023-01-11T08:47:03.915Z
                    // 0200-165515-0116165515 - 0000053994100000000000       // [ 'Mon Jan 16 2023 08:25:34 GMT+0100 (West Africa Standard Time)' ]
                    // field90: originalMTI(4 characters) originalSTAN(6 characters) originalMMDDHHMMSS(10 characters) originalAIIC 00000000000 FIIC

            }
            
            let onlinePin = false;
            if(mti === '0420'){
                onlinePin = this.requestData.previousTransactionJournal.onlinePin;
            }else if(mti === '0200'){
                onlinePin = !this.requestData.pinblock ? false : true;
            }

            let saveDetails = {
                rrn: this.payload.rrn,
                prrn: this.payload.rrn,
                onlinePin: onlinePin,
                merchantName: this.requestData.merchantAddress ? this.requestData.merchantAddress.substring(0, 22) : this.requestData.previousTransactionJournal.merchantName,
                merchantAddress: this.requestData.merchantAddress ? this.requestData.merchantAddress : this.requestData.previousTransactionJournal.merchantAddress,
                merchantId: this.requestData.merchantId ? this.requestData.merchantId : this.requestData.previousTransactionJournal.merchantId,
                terminalId: this.payload.terminalId,
                STAN: this.requestData.previousTransactionJournal && this.requestData.previousTransactionJournal.STAN ? this.requestData.previousTransactionJournal.STAN : randomString(),
                transactionTime: new Date(),
                merchantCategoryCode: this.requestData.merchantCategoryCode ? this.requestData.merchantCategoryCode : this.requestData.previousTransactionJournal.merchantCategoryCode,
                handlerName: this.handlerName,
                MTI: mti,
                maskedPan: this.requestData.pan.substr(0, 6) + ''.padEnd(this.requestData.pan.length - 10, 'X') + this.requestData.pan.slice(-4),
                processingCode: this.requestData.processingCode ? this.requestData.processingCode : this.requestData.previousTransactionJournal.processingCode,
                amount: this.requestData.amount ? parseInt(this.requestData.amount) : formatReversalAmount(this.requestData.previousTransactionJournal.amount),
                currencyCode: '566',
                messageReason: null,
                // originalMMDDHHMMSS(10 characters) 
                // originalAIIC 00000000000
                        // 0200-165515-0116165515 - 0000053994100000000000              // [ 'Mon Jan 16 2023 08:25:34 GMT+0100 (West Africa Standard Time)' ]
                        // field90: originalMTI(4 characters) originalSTAN(6 characters) 
                        // originalMMDDHHMMSS(10 characters) 
                        // originalAIIC 00000000000 FIIC
                originalDataElements: mti === '0420' ? 
                `0200${this.requestData.previousTransactionJournal.STAN}${this.getMonth(dateTImeCombination[1])+dateTImeCombination[2]}${dateTImeCombination[4].slice(0,2)+dateTImeCombination[4].slice(3,5)+dateTImeCombination[4].slice(6,8)}${padLeft(this.requestData.pan.slice(0,5),'0',11)}00000000000` : null,
                customerRef: this.requestData.customRefData ? this.requestData.customRefData : this.requestData.previousTransactionJournal.customerRef,
                cardExpiry: this.requestData.expiryDate ? this.requestData.expiryDate : this.requestData.previousTransactionJournal.cardExpiry,
                // transactionType: this.vasData !== null || this.vasData !== undefined || this.vas4Data !== null || this.vas4Data !== undefined ? 'VAS' : 'Purchase',
                transactionType: this.payload.transactionType === '01' ? 'VAS' : 'Purchase',
                isVasComplete: false,
                vasData: this.vas4Data !== null || this.vas4Data !== undefined ? this.vas4Data : this.vasData !== null || this.vasData !== undefined ? this.vasData : null,
                handlerUsed: this.handlerUsed
            }
            this.saveDetails = {...saveDetails};
            this.transactionDetails = {
                ...saveDetails
            }

            // console.log('iso message sent for transaction', isomessage.toString());
            //Based on Transaction TYpe, send transaction to ISW if possible
            console.log(this.payload.transactionType, 'txn type stuff');
            let response = await this.sendSocketData(isomessage);
            console.log("RESPONSE from Nibss DATA, ", JSON.stringify(this.iso8583Parser.unpack(response.toString().substr(2))));
            return response;
        } catch (error) {
            console.log('whole Error', error);
            console.log(`error processing transaction with EFT-ENGINE for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error processing transaction with EFT-ENGINE for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }

    }

    async handle() {
        try {
        const response = await this.process('0200');
        if(!response.toString()) return;

        let unpackedMsg = this.iso8583Parser.unpack(response.toString().substr(2));
        console.log(unpackedMsg, 'UNPACKED MSG RESPONSE');


        let responseDetails = {
            rrn: unpackedMsg.dataElements['37'],
            onlinePin: (unpackedMsg.dataElements[52] !== null ? true : false),
            merchantName: unpackedMsg.dataElements[43].substring(0, 22),
            merchantAddress: unpackedMsg.dataElements[43].substring(23),
            merchantId: unpackedMsg.dataElements[42],
            terminalId: unpackedMsg.dataElements[41],
            STAN: unpackedMsg.dataElements[11],
            transactionActivityTime: unpackedMsg.dataElements[7],
            transactionTime: unpackedMsg.dataElements[12],
            transactionDate: unpackedMsg.dataElements[13],
            responseTime: new Date(),
            responseCode: Util.getResponseCode(unpackedMsg),
            merchantCategoryCode: unpackedMsg.dataElements[18],
            handlerName: this.handlerName,
            MTI: unpackedMsg.mti,
            maskedPan: unpackedMsg.dataElements[2].substr(0, 6) + ''.padEnd(unpackedMsg.dataElements[2].length - 10, 'X') + unpackedMsg.dataElements[2].slice(-4),
            processingCode: unpackedMsg.dataElements[3],
            amount: parseInt(unpackedMsg.dataElements[4]),
            currencyCode: unpackedMsg.dataElements[49] || '566',
            messageReason: Util.getNibssResponseMessageFromCode(unpackedMsg.dataElements[39]) || null,
            originalDataElements: unpackedMsg.dataElements[90] || "",
            customerRef: unpackedMsg.dataElements[59] || "",
            script: unpackedMsg.dataElements[55] || "",
            // aiic: padLeft(unpackedMsg.dataElements[35].substr(0,6),"0",11),
            // ficc: padLeft(unpackedMsg.dataElements[32],'0',11),
            aiic: padLeft(unpackedMsg.dataElements[35].substr(0,6),"0",11) || "",
            fiic: padLeft(unpackedMsg.dataElements[33],'0',11) ? padLeft(unpackedMsg.dataElements[33],'0',11) : null,
            authCode: unpackedMsg.dataElements[38] ? unpackedMsg.dataElements[38] : '',
        }
        return responseDetails;
        } catch (error) {
        console.log(`Transaction error sending response to Client for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
        Util.fileDataLogger(this.payload.terminalId,`error sending response of transaction with EFT-ENGINE for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
        return false;
        }
    }

    async handleReversal() {
        try {
            //find the transaction Journal on the database.
            console.log('sent masked data', Util.getMaskPanByPan(this.payload.pan));
            
            
            // if(previousTransactionJournal.responseCode !== '99' || previousTransactionJournal.responseCode !== '100'){
            //     return {
            //         error: true,
            //         status: 'Transaction did not timeout previously',
            //         messageReason: `${Util.getNibssResponseMessageFromCode(previousTransactionJournal.responseCode)}`,
            //         responseCode: previousTransactionJournal.responseCode
            //     }
            // }

            // {
            //     "terminalId": "2301A108",
            //     "sequenceNumber": "001",
            //     "rrn": "57828481582X",
            //     "icc": "9F3303E0F9C8950500800000009F3704956042899F10120110A74003023000000000000000000000FF9F2608F9AEBB58D641F1A59F2701809F36020134820239009C01009F1A0205669A032301119F02060000000005009F03060000000000009F34034403029F3501225F3401015F2A020566",
            //     "pinblock": "34353637",
            //     "dataCode": "510101511344101",
            //     "pan": "5198994077515927"
            // }

            // {
            //     "rrn": "242153479142",
            //     "stan": "531056",
            //     "track2data": "5061104947777269519D2412601006451766",
            //     "processingCode": "001000",
            //     "amount": "000000000001",
            //     "merchantCategoryCode": "5050",
            //     "sequenceNumber": "000",
            //     "terminalId": "207003DW",
            //     "merchantId": "FBP204010449858",
            //     "merchantAddress": "ITEX INTEGRATED SERVICELA           LANG",
            //     "icc": "9F26087A41030E8D1A02769F2701809F10200FA501A202F8000000000000000000000F0F08010000000000000000000000009F37041B0413949F360200BD950500802480009A032211169C01009F02060000000000015F2A020566820258009F3303E0E8F05F3401009F3501229F34034203009F1A0205669F1E0833443934333034338407A00000037100019F09020002",
            //     "customRefData": "~0014A0000003710001011000802480000204E8000309Verve CPA09083D94304310067.9.160508000032860602CT040424120803S90",
            //     "dataCode": "510101511344101",
            //     "transactionTime": "093015",
            //     "transactionDate": "1128",
            //     "aiic": "00000506110",
            //     "fiic": "00000639138"
            // }
            const response = await this.process('0420');
            // const response = await this.processReversal('0420');
            if(!response) return;
            if(!response.toString()) return;

            let unpackedMsg = this.iso8583Parser.unpack(response.toString().substr(2));
            console.log('UNPACKED MSG RESPONSE', unpackedMsg);

            let responseDetails = {
                rrn: unpackedMsg.dataElements['37'],
                onlinePin: (unpackedMsg.dataElements[52] !== null ? true : false),
                merchantName: unpackedMsg.dataElements[43].substring(0, 22),
                merchantAddress: unpackedMsg.dataElements[43].substring(23),
                merchantId: unpackedMsg.dataElements[42],
                terminalId: unpackedMsg.dataElements[41],
                STAN: unpackedMsg.dataElements[11],
                responseTime: new Date(),
                responseCode: Util.getResponseCode(unpackedMsg),
                merchantCategoryCode: unpackedMsg.dataElements[18],
                handlerName: this.handlerName,
                MTI: unpackedMsg.mti,
                maskedPan: unpackedMsg.dataElements[2].substr(0, 6) + ''.padEnd(unpackedMsg.dataElements[2].length - 10, 'X') + unpackedMsg.dataElements[2].slice(-4),
                processingCode: unpackedMsg.dataElements[3],
                amount: parseInt(unpackedMsg.dataElements[4]),
                currencyCode: unpackedMsg.dataElements[49],
                messageReason: Util.getNibssResponseMessageFromCode(unpackedMsg.dataElements[39]),
                originalDataElements: unpackedMsg.dataElements[90],
                customerRef: unpackedMsg.dataElements[59] || "",
                script: unpackedMsg.dataElements[55],
                authCode: unpackedMsg.dataElements[38] ? unpackedMsg.dataElements[38] : '',
            }
            return responseDetails;
        } catch (error) {
            console.log(`Reversal error sending response to Client for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error sending response of transaction with EFT-ENGINE for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }
    }

    async handleBalanceEnquiry() {
        try{
            const response = await this.process('0100');
            if(!response.toString()) return;

            let unpackedMsg = this.iso8583Parser.unpack(response.toString().substr(2));
            console.log('UNPACKED MSG RESPONSE', unpackedMsg);
            let responseDetails = {
                rrn: unpackedMsg.dataElements['37'],
                onlinePin: (unpackedMsg.dataElements[52] !== null ? true : false),
                merchantName: unpackedMsg.dataElements[43].substring(0, 22),
                merchantAddress: unpackedMsg.dataElements[43].substring(23),
                merchantId: unpackedMsg.dataElements[42],
                terminalId: unpackedMsg.dataElements[41],
                STAN: unpackedMsg.dataElements[11],
                responseTime: new Date(),
                responseCode: Util.getResponseCode(unpackedMsg),
                merchantCategoryCode: unpackedMsg.dataElements[18],
                handlerName: this.handlerName,
                MTI: unpackedMsg.mti,
                maskedPan: unpackedMsg.dataElements[2].substr(0, 6) + ''.padEnd(unpackedMsg.dataElements[2].length - 10, 'X') + unpackedMsg.dataElements[2].slice(-4),
                processingCode: unpackedMsg.dataElements[3],
                amount: parseInt(unpackedMsg.dataElements[4]),
                currencyCode: unpackedMsg.dataElements[49],
                messageReason: Util.getNibssResponseMessageFromCode(unpackedMsg.dataElements[39]),
                originalDataElements: unpackedMsg.dataElements[90],
                customerRef: unpackedMsg.dataElements[59] || "",
                script: unpackedMsg.dataElements[55],
                authCode: unpackedMsg.dataElements[38] ? unpackedMsg.dataElements[38] : '',
            }
            return responseDetails;
        } catch (error) {
            console.log(`error sending response to Client for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.payload.terminalId,`error sending response of transaction with EFT-ENGINE for TID : ${this.payload.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }
    }

    async prepareISORequest(mti) {

    //  let packedMessage = '';
    console.log(this.requestData.pan, 'check pan');

      dataElements128[2] = this.requestData.pan;
      dataElements128[3] = this.requestData.processingCode ? this.requestData.processingCode: this.requestData.previousTransactionJournal.processingCode;
      dataElements128[4] = this.requestData.amount ? this.requestData.amount : padLeft(this.requestData.previousTransactionJournal.amount.toString(), '0', 12);
      dataElements128[7] = mti === '0420' ? `${Util.formatTimestampForIsoRequest().dateFormat}${Util.formatTimestampForIsoRequest().timeFormat}` : Util.formatTimestampForIsoRequest().dateFormat + Util.formatTimestampForIsoRequest().timeFormat;
      dataElements128[11] = this.requestData.previousTransactionJournal && this.requestData.previousTransactionJournal.STAN ? this.requestData.previousTransactionJournal.STAN : randomString();
      dataElements128[12] = mti === '0420' ? Util.formatTimestampForIsoRequest().timeFormat : Util.formatTimestampForIsoRequest().timeFormat;
      dataElements128[13] = mti === '0420' ? Util.formatTimestampForIsoRequest().dateFormat : Util.formatTimestampForIsoRequest().dateFormat;
      dataElements128[14] = this.requestData.expiryDate ? this.requestData.expiryDate : this.requestData.previousTransactionJournal.cardExpiry;
      dataElements128[18] = this.requestData.merchantCategoryCode ? this.requestData.merchantCategoryCode : this.requestData.previousTransactionJournal.merchantCategoryCode;
      dataElements128[22] = '051';
      dataElements128[23] = this.requestData.sequenceNumber;
      dataElements128[25] = '00';
      dataElements128[26] = '04';
      dataElements128[28] = 'D00000000';
      dataElements128[32] = this.requestData.pan.substring(0, 6);
      dataElements128[35] = this.requestData.track2data;
      dataElements128[37] = this.payload.rrn;
      dataElements128[40] = this.requestData.restrictionCode;
      dataElements128[41] = this.requestData.terminalId;
      dataElements128[42] = this.requestData.merchantId ? this.requestData.merchantId : this.requestData.previousTransactionJournal.merchantId;
      dataElements128[43] = this.requestData.merchantAddress ? this.requestData.merchantAddress: this.requestData.previousTransactionJournal.merchantName + this.requestData.previousTransactionJournal.merchantAddress;
      dataElements128[49] = '566';
      if(mti === '0420'){
        dataElements128[52] = this.requestData.previousTransactionJournal && this.requestData.previousTransactionJournal.onlinePin ? this.requestData.pinBlock : null;
    }else if(mti === '0200'){
        dataElements128[52] = !this.requestData.pinblock
        //   ? null : this.calculateNibssPinblock(this.requestData.pinblock, await this.getTerminalKeys(this.payload.terminalId));
          ? null : this.requestData.pinblock;
          let checker = this.calculateNibssPinblock(this.requestData.pinblock, await this.getTerminalKeys(this.payload.terminalId))
          console.log(this.requestData.pinblock, 'PINBLOCK FROM JAIZ');
          console.log(checker, 'PINBLOCK to NIBSS');
    }
    //   dataElements128[52] = this.requestData.pinblock === undefined || this.requestData.pinblock === null || this.requestData.pinblock === ""
    //     ? null : this.calculateNibssPinblock(this.requestData.pinblock, await this.getTerminalKeys(this.payload.terminalId));

      dataElements128[55] = this.requestData.icc;
      dataElements128[56] = mti === '0420' ? "4021" : null;
      dataElements128[59] = this.requestData.customRefData ? this.requestData.customRefData : this.requestData.previousTransactionJournal.customerRef;

    //   let acqCode = padLeft(unpackedMessage.dataElements[35].substr(0,6),"0",11);
    //   let originalForwardingInstCode = padLeft(unpackedMessage.dataElements[32],'0',11);
    //   let value = '0200'  + originalSN + transDateandTime + acqCode + originalForwardingInstCode;
      
      if(mti === '0420'){
        let paddedFiic = padLeft(this.requestData.previousTransactionJournal.FIIC,"0", 11);
        let paddedAiic = padLeft(this.requestData.pan.slice(0,5),'0',11);
        let combination = this.requestData.previousTransactionJournal.transactionTime.toString().split(' ');
        console.log(combination,'combination');
        // `0200${this.requestData.previousTransactionJournal.STAN}
        //         ${this.getMonth(combination[1])+combination[2]}${combination[4].slice(0,2)+combination[4].slice(3,5)+combination[4].slice(6,8)}${padLeft(this.requestData.pan.slice(0,5),'0',11)}00000000000`
        
        // dataElements128[90] = mti === '0420' ? `0200${this.requestData.previousTransactionJournal.STAN}${Util.formatTimestampForIsoRequest().dateFormat}${Util.formatTimestampForIsoRequest().timeFormat}${paddedAiic}${paddedFiic}` : null;
        // console.log(mti, 'mti');
        // console.log(mti === '0420', 'mti status');
        dataElements128[90] = `0200${this.requestData.previousTransactionJournal.STAN}`+ this.getMonth(combination[1])+`${combination[2]}${combination[4].slice(0,2)+combination[4].slice(3,5)+combination[4].slice(6,8)}${paddedAiic}${paddedFiic}`;
      }
      
      dataElements128[95] = mti === '0420' ? padLeft(this.requestData.previousTransactionJournal.amount.toString(),'0',12)+`000000000000D00000000D00000000` : null;
      dataElements128[123] = this.requestData.dataCode;
      dataElements128[128] = '0000000000000000000000000000000000000000000000000000000000000000';
      console.log('dataElement before packing', dataElements128);
      const packedMessageWithout128 = this.iso8583Parser.pack(mti, dataElements128).isoMessage;
    //   console.log(this.terminalKeys, 'passed to calc hash');
      
      dataElements128[128] = this.calculateHashData(this.terminalKeys, packedMessageWithout128).toString();
      
      let packedIsoMessage = this.iso8583Parser.pack(mti, dataElements128).isoMessage;
      console.log('packed MESSAGE tO BE SENT', packedIsoMessage);
    //   Util.fileDataLogger()
      let binLen = Util.getLengthBytes(packedIsoMessage.length);
      return Buffer.concat([binLen,Buffer.from(packedIsoMessage,"utf8")]);
    }

    /**
     * send and await soocket message.
     * @param {String} reqMsg iso request message
     */
    async sendSocketData(reqMsg){
        console.log("NIBSS REQUEST DATA to EFT-ENGINE, ", reqMsg);
        let socketclient = new SocketClient(this.Ip,this.Port,true);
        let socketHandler = socketclient.startClient(reqMsg);

        let self = this;
        return new Promise((resolve, reject) => {
                socketHandler.on('data', data => {
                    console.log(`EFT-ENGINE response from nibss : ${data.toString('HEX')}`)
                    resolve(data);
                });
                socketHandler.on('error', err => {
                    console.log(`EFT-ENGINE : ${err}`)
                    reject(err);
                });
                socketHandler.on('timeout', err => {
                    console.log(`EFT-ENGINE timed out: ${err}`)
                    reject(false);
                });
                socketHandler.on('close', err => {
                    console.log(`EFT-ENGINE socket closed out : ${err}`)
                    reject(false);
                });
            }

        );
    }

    async getTerminalKeys(terminalId) {

        let terminal = await TerminalKey.findTerminal(terminalId);
        if (!terminal) return false;
        return terminal;
    }

    calculateNibssPinblock(pinBlock, terminal) {

        // let clearPin = Util.decrypt3DES(pinBlock, 'hex', decryptKey, 'hex', 'hex');
        // // console.log('pin :'+clearPin);
        // let newPinBlock = Util.encrypt3DES(clearPin, 'hex', encryptKey, 'hex', 'hex');
        // // console.log('new pinblock: '+newPinBlock);

        // while (withoutLength.includes(pinBlock))
        //     withoutLength = withoutLength.replace(pinBlock, newPinBlock);

        if(!pinBlock || !terminal) return null;
        console.log('passed to calc PINBLOCK', terminal);
        // console.log('passed to decrypt PINKEY', terminal.pinKey_1);
        // console.log('passed for masterkye', terminal.masterKey_1)
        let clearPinKey = ExtractKey.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1,1);
        console.log('clear PInkey', clearPinKey)
        let clearPinblock = Util.decrypt3DES(pinBlock,"hex",clearPinKey,"hex","hex");
        console.log(`clear pin ${clearPinblock}`)

        // let uPinkey  = ExtractKey.getDecryptedPinKey(terminal.upslKey.TPK,terminal.upslKey.TMK,"up");
        // let upPinblock = Util.encrypt3DES(clearPinblock,"hex",uPinkey,"hex","hex");

        let nibssPinBlock = Util.encrypt3DES(clearPinblock,"hex",clearPinKey,"hex","hex");

        console.log(`NIbss pin: ${nibssPinBlock}`);
        return nibssPinBlock;
    }

    calculateHashData(terminal, message) {
        // console.log('at calc hash data', terminal);
        let decryptedSessionKey = ExtractKey.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
        // let decryptedSessionKey = ExtractKey.getDecryptedSessionKey(terminal.upslKey.TSK,terminal.upslKey.TMK,"up");
        const hashMessage = Util.doSha256(decryptedSessionKey, message);
        return hashMessage.toUpperCase();
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

}

module.exports = TransactionServices;