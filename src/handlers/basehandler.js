require("dotenv").config();

const SocketClient = require("../socket/socketclient");

const Journal = require("../model/journalmodel");

const TransactionEvent = require('../events/transactionevent');

const BankConfigs = require('../model/bankconfigModel');

const Util = require('../helpers/Util');
const ExtractKeys = require('../helpers/ExtractKeys');
const TamsHandler = require('../handlers/tamsHandler');
const TerminalKey = require('../model/terminalkeysModel');
const ResponseMiddleware = require('../helpers/ResponseMiddleware');
const RequestMiddleware = require('../helpers/RequestMiddleware');
// const frdConfig = require('../config/firstbankmonitor.json');
const InterswitchHandler = require('../handlers/interswitchHandler');

const EmailNotifier = require('../notifications/notifiers/emailnotifier');

const UpslHandler = require('../handlers/upslHandler');



class BaseHandler {

    constructor(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled = true, extralData = null, prrn = null) {

        this.handlerName = "NIBSS " +process.env.handler;
        this.handlerUsed = process.env.handler;

        this.handlingModel = Journal;

        this.socketServerInstance = socketServerInstance;

        this.isoParser = isoParser;

        this.requestData = requestData;

        this.virtualTidKeys = {};

        this.isVirtualTid = false;

        this.handlerEvent = new TransactionEvent();

        this.tlsEnabled = tlsEnabled;

        this.handlingServerTLSEnabled = this.tlsEnabled;

        this.handlingServerIP = process.env.HANDLER_EPMS_IP;

        this.handlingServerPort = process.env.HANDLER_EPMS_PLAIN_PORT;



        if (this.handlingServerTLSEnabled) {

            this.handlingServerPort = process.env.HANDLER_EPMS_TLS_PORT;

        }

        this.unpackedMessage = unpackedMessage;

        this.unpackedHandlingServerMessage = null;

        this.handlingServerResponseTime = null;

        this.socketServerInstanceClosed = false;

        this.handlingServerReplied = false;

        this.transactionDetails = {};

        // keep track of number of tries done
        this.retrying = false;
        this.RetriesDone = 0;

        this.nibss1Enabled = true;
        this.nibss2failoverEnabled = false;
        this.tamsfailoverEnabled = false;
        this.tamsPriority = true;
        this.interswitchEnabled = false;
        this.upslEnabled = false;
        this.allow_failover = process.env.ALLOW_FAILOVER;
        // do not manually change this to true, unless you know what you're doing.
        this.noAttemptNibss = false;
        this.bankFailoverResponses = [];

        this.isNeolife = false;
        this.isFrsc = false;
        this.isSterling = false;
        this.isRemita = false;
        this.isWemaCollect = false;
        this.clearCustRef = false;

        this.config = null;

        this.tamsHandler = null;
        this.tamsRequestData = null;
        this.interswitchHandler = null;

        this.vasData = extralData ? extralData["vasData"] || null : null;
        this.vas4Data = extralData ? extralData["vas4Data"] || null : null;
        this.receiptData = extralData ? extralData["ereceipt"] || null : null;
        this.remittaData = extralData ? extralData["remita"] || null : null;
        this.stanbicdstvData = extralData ? extralData["stanbicdstv"] || null : null;
        this.jambprcData = extralData ? extralData["jamb"] || null : null;
        this.prrn = prrn;

    }

    async process() {
        let response = {
            error: false
        }

        //Register Middlewares
        await this.registerMiddlewares();

        //GTBank Validation
        let isInvalid = await RequestMiddleware.checkIfGtbankTerminalValidTransactionAmount(this.unpackedMessage);
        if (isInvalid == true) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }

        //NIPCO Validation
        isInvalid = await RequestMiddleware.checkIfNIPCOTerminalValidTransactionAmount(this.unpackedMessage);
        if (isInvalid == true) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }

        // providus validation
        let valid = await RequestMiddleware.checkProvidusRequest(this.unpackedMessage);
        if (valid == false) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        // FRSC validation
        let frsc = await RequestMiddleware.checkFrscRequest(this.unpackedMessage);
        if (frsc == false) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        // STERLLING validation
        let sterling = await RequestMiddleware.checkSterlingRequest(this.unpackedMessage);
        if (sterling == false) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        // gtb monitor validation
        let gtb = RequestMiddleware.checkGtbMonitorRequest(this.unpackedMessage);
        if (gtb == false) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        // exhangebox notification validation
        let exchangebox = await RequestMiddleware.checkExchangeboxRequest(this.unpackedMessage);
        if (exchangebox == false) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        // rsuth notification validation
        // let rsuth = await RequestMiddleware.checkRsuthRequest(this.unpackedMessage);
        // if (rsuth == false) {
        //     this.socketServerInstance.end();
        //     response.error = true;
        //     return response;
        // }
        ///////

        // etz notification validation
        let clearRef = RequestMiddleware.checkClearCustomerRefRequest(this.unpackedMessage);
        if (clearRef) {
            this.clearCustRef = clearRef;
        }

        let isValidEtzRequest = RequestMiddleware.checkEtzTransactionAboveThreshold(this.unpackedMessage, process.env.etz_threshhold_amount);
        
        
        if(isValidEtzRequest == false) {
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        // for IGR request
        this.clearCustRef = RequestMiddleware.checkIGRRequest(this.unpackedMessage);
        this.isRemita = RequestMiddleware.checkRemitaRequest(this.unpackedMessage);
        this.isWemaCollect = RequestMiddleware.checkWemaCollectRequest(this.unpackedMessage);

        // temporary for migrated terminals
        let prompt = RequestMiddleware.checkforMigratedTerminal(this.unpackedMessage);
        if (prompt != false) {
            console.error(`Forcing terminal to reprep, ${Util.getTerminalId(this.unpackedMessage)}, data ${prompt.toString()} at ${new Date().toString()}`);
            this.socketServerInstance.write(prompt);
            this.socketServerInstance.end();
            response.error = true;
            return response;
        }
        ///////

        //Call Pre Process Middlewares
        let initialSave = await this.saveInitialTransaction();

        if (initialSave === false) {
            response.error = true;
            response.message = "Unable to save initial transaction, aborting";

            console.error(`There was an error saving the initial transaction, aborting`);
            EmailNotifier.sendCriticalErrorAlert("There was an error saving the initial transaction, aborting");

            // unique RRN is required
            if(this.isFrsc  || this.isSterling || this.isNeolife){
                this.socketServerInstance.end();
                return response;
            }
        }

        if (process.env.APP_ENV == "local" && process.env.APP_DEBUG) {

            console.log("Unpacked Message from client");
            console.log(this.unpackedMessage);

        }
        Util.fileIsoLogger(this.unpackedMessage,this.requestData.toString());

        /**
         * uncomment for fail-over test
         */
        // this.requestData = this.requestData.toString().replace("9F02", "####");

        //Call the handle
        await this.handle();

        //Call the Post Process Middlewares
        return response;
    }

    unpack(data) {

        let unpacked = this.isoParser.unpack(data);

        return unpacked;

    }

    async registerMiddlewares() {
        // Neo life Middleware
        let uniqueRRN = await ExtractKeys.getNeoLifeUniqueRRN(this.unpackedMessage);
        if (uniqueRRN) {
            console.log(`Neolife unique RRN ${uniqueRRN} at ${new Date().toString()}`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Neolife unique RRN ${uniqueRRN} at ${new Date().toString()}`);

            this.unpackedMessage.dataElements[37] = uniqueRRN;
            this.isNeolife = true;
        }
        //////////////////////////////////////////////////////

        // FRSC Middleware
        let frscRRN = await ExtractKeys.getFRSCUniqueRRN(this.unpackedMessage);
        if(frscRRN){
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`FRSC unique RRN ${frscRRN} at ${new Date().toString()}`);

            this.unpackedMessage.dataElements[37] = frscRRN;
            this.isFrsc = true;
        }
        ///////////////////////////////////////////////////////
        // STERLING Middleware
        let sterlingRRN = await ExtractKeys.getFRSCUniqueRRN(this.unpackedMessage);


        if(sterlingRRN){
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`STERLING unique RRN ${sterlingRRN} at ${new Date().toString()}`);

            this.unpackedMessage.dataElements[37] = sterlingRRN;
            this.isSterling = true;
        }
        ///////////////////////////////////////////////////////
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
            handlerUsed: this.handlerUsed,
            posDataCode: this.unpackedMessage.dataElements[123] || "",
            posEntryMode: this.unpackedMessage.dataElements[22] || "",
            cardName: Util.getCardType(this.unpackedMessage.dataElements[2]),
            isContactless: this.unpackedMessage.dataElements[22] ? this.unpackedMessage.dataElements[22].substr(0, 2) === "07" : false,
        }

        if (Util.isMitType(this.unpackedMessage, '02') && Util.getICCData(this.unpackedMessage) !== false) {
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

    async updateSavedTransaction() {
        let updateDetails = {
            messageReason: Util.getNibssResponseMessageFromCode(this.transactionDetails.interSwitchResponse ? this.transactionDetails.interSwitchResponse : this.unpackedHandlingServerMessage.dataElements[39]),
            failOverRrn: Util.getFailOverRRN(this.unpackedMessage, this.unpackedHandlingServerMessage),
            oldResCode: this.transactionDetails.oldResCode ? this.transactionDetails.oldResCode : '',
            responseCode: this.transactionDetails.interSwitchResponse ? this.transactionDetails.interSwitchResponse : this.unpackedHandlingServerMessage.dataElements[39],
            script: this.unpackedHandlingServerMessage.dataElements[55],
            authCode: this.unpackedHandlingServerMessage.dataElements[38] ? this.unpackedHandlingServerMessage.dataElements[38] : this.transactionDetails.authCode,
            handlerResponseTime: this.handlingServerResponseTime ? this.handlingServerResponseTime : new Date,
            write2pos : '00',
            FIIC : Util.getFIIC(this.unpackedHandlingServerMessage),

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

        // console.log(this.transactionDetails);

        let updated = false;

        await this.handlingModelInstance.set(updateDetails).save()
            .then(() => {

                console.log(`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, ${JSON.stringify(this.transactionDetails)}`);

                updated = true;
            })
            .catch((error) => {

                console.error(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);

                EmailNotifier.sendCriticalErrorAlert(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);
            });

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

    async handle() {
        try{

        let theSocketClient = await this.setUpClientSocket();
        // console.log(this.config,'Unpacked message at Handle fxn...');
        let terminalId = Util.getTerminalId(this.unpackedMessage);
        let theSocketClientInstance = null;
        this.isVirtualTid = process.env.virtualTids.split(',').includes(terminalId);

        if(this.unpackedMessage.mti === "0200") {

            if(this.isVirtualTid && Util.isWithdrawalVirtualTidRequest(this.unpackedMessage)) {
                // console.log('checking if withdrawal and vtid..');

                const keysArray = Util.extractVirtualTIDKeys(this.unpackedMessage);

                // console.log(keysArray)

                let terminal = {
                    masterKey_1: process.env.VIRTUALTIDMASTERKEY,
                    sessionKey_1: keysArray[1].substr(0, 32),
                    pinKey_1: keysArray[0]
                }

                this.virtualTidKeys = terminal;

                //console.log("virtual tid keys => ", this.virtualTidKeys);

                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, "virtualtid");
                // let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponse(response.toString(), clearSessionKey);

                // console.log("Clear Session Key => ", clearSessionKey);

                // remove field 53 for routing to nibss
                this.unpackedMessage.dataElements[53] = null;

                //console.log("REQUEST DATA => ", this.unpackedMessage.dataElements);

                this.requestData = ExtractKeys.rehashUnpackedIsoMessage(this.unpackedMessage.dataElements, this.isoParser, clearSessionKey, this.unpackedMessage.mti);
                console.log('data sent VTID & withdrawal check', this.requestData);
            } else {

                let terminal = await TerminalKey.findTerminal(terminalId);
                
                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);

                this.requestData = ExtractKeys.rehashUnpackedIsoMessage(this.unpackedMessage.dataElements, this.isoParser, clearSessionKey, this.unpackedMessage.mti);
                console.log('data sent at not withdrawal', this.requestData);
            }

        }

        if(this.unpackedMessage.mti === "0420") {
            //rebuild reversal message because the rrn has been updated

            if(this.isVirtualTid && Util.isWithdrawalVirtualTidRequest(this.unpackedMessage)) {

                const keysArray = Util.extractVirtualTIDKeys(this.unpackedMessage);

                let terminal = {
                    masterKey_1: process.env.VIRTUALTIDMASTERKEY,
                    sessionKey_1: keysArray[1].substr(0, 32),
                    pinKey_1: keysArray[0]
                }

                this.virtualTidKeys = terminal;

                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, "virtualtid");

                this.requestData = ExtractKeys.rehashUnpackedIsoMessage(this.unpackedMessage.dataElements, this.isoParser, clearSessionKey, this.unpackedMessage.mti);

            } else {
                let terminal = await TerminalKey.findTerminal(terminalId);
                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                this.requestData = ExtractKeys.rehashUnpackedIsoMessage(this.unpackedMessage.dataElements, this.isoParser, clearSessionKey, this.unpackedMessage.mti);
            }
        }

        if(this.noAttemptNibss == false || this.RetriesDone > 0) {
            //console.log("the iso request", this.requestData);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `TID Routing to NIBSS...noAttemptNibss${this.noAttemptNibss} retries done ${this.RetriesDone}`);
            theSocketClientInstance = theSocketClient.startClient(this.requestData);
        } else {
            // get terminal keys from db
    
            if (terminal != null && !this.isVirtualTid) {
                // nibss 2 fall-over
                let result = await this.processFailoverRequest(terminal,terminalId,"101",theSocketClientInstance,false);
                if(result === null)return;
                if(result !== false && result !== null ){
                   this.afterTransactionProcess(result,null);
                   return;
                }else{


                    theSocketClientInstance = theSocketClient.startClient(this.requestData); 
                }
            }else{
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `TID Routing to NIBSS NOT in LOOP...noAttemptNibss${this.noAttemptNibss || ""} retries done ${this.RetriesDone || ""}`);
                theSocketClientInstance = theSocketClient.startClient(this.requestData); 
            }
        }


        let handlingServerResponse = '';
        // for data validation
        let hexData = '';

        //Listening for data from Processor
        theSocketClientInstance.on('data', async (data) => {
            this.handlingServerResponseTime = new Date();
            this.handlingServerReplied = true;

            if (process.env.APP_ENV == "local" && process.env.APP_DEBUG) {
                console.log(`Received Data: ${data.toString('hex')} from: ${theSocketClientInstance.name}, TLS: ${this.handlingServerTLSEnabled}`);
            }

            handlingServerResponse += data;
            hexData += Buffer.from(data).toString('hex');
            if (hexData.length < 4)
                return;
            let dLen = Number.parseInt(hexData.substr(0, 4), 16);
            if (handlingServerResponse.substr(2).length < dLen)
                return;

            // incase response is in chuncks
            data = Buffer.from(hexData, 'hex');

            // has retried (incase i retried) rehash the response using nibss1 details
            if ((this.retrying && this.RetriesDone > 0) || this.nibss1Enabled == false) {
                // get terminal keys from db
                let terminalId = Util.getTerminalId(this.unpackedMessage);
                let terminal = await TerminalKey.findTerminal(terminalId);

                if (terminal != null) {
                    let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                    let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponse(handlingServerResponse.toString(), clearSessionKey);
                    data = rehashWithNibbs1Key;
                }
            }
            this.retrying = false;

            this.unpackedHandlingServerMessage = this.unpack(handlingServerResponse.toString().substring(2));
            // console.log(this.unpackedHandlingServerMessage, 'message from Processor');

            if (process.env.APP_ENV == "local" && process.env.APP_DEBUG) {
                console.log("Response from the server handler");
                console.log(this.unpackedHandlingServerMessage);
            }
            Util.fileIsoLogger(this.unpackedHandlingServerMessage,data.toString().substring(2));

            // check if the it's a Network Message and keep the keys
            if (Util.isMitType(this.unpackedMessage, '08') && Util.isKeyRequest(this.unpackedMessage)) {
                let processingCode = Util.getProcessingCode(this.unpackedMessage);
                let terminalId = Util.getTerminalId(this.unpackedMessage);
                ExtractKeys.getTerminalKey(terminalId, this.unpackedHandlingServerMessage, processingCode, 1);
            }

            // check nibss response code if it's 06 then do fail-over
            if (Util.isMitType(this.unpackedMessage, '02')) {
                let responseCode = Util.getResponseCode(this.unpackedHandlingServerMessage)
                console.log('response code: ' + responseCode);
                // console.log('bank fail over responses', this.bankFailoverResponses);
                
                if ((Util.isFailoverResponse(responseCode,this.bankFailoverResponses)) && (this.allow_failover == 'y' || this.config)) {
                    // get terminal keys from db
                    let terminalId = Util.getTerminalId(this.unpackedMessage);
                    let terminal = await TerminalKey.findTerminal(terminalId);

                    if (terminal != null) {
                        // nibss 2 fall-over
                        let result = await this.processFailoverRequest(terminal,terminalId,responseCode,theSocketClientInstance);
                        if(result === null) return;
                        if(result !== false && result !== null ){
                            data = result;
                        }else{
                            
                        }
                    }

                }
            }
            await this.afterTransactionProcess(data,theSocketClientInstance);
        });

        theSocketClientInstance.on('close', async () => {

            if (this.socketServerInstanceClosed !== true && this.handlingServerReplied !== true && !this.retrying) {
                this.retrying = true;
                console.error(`Closing the client because the handling server closed without a response MTI ${this.unpackedMessage.mti} rrn ${this.transactionDetails.rrn} terminal ${this.transactionDetails.terminalId} at ${new Date().toString()}, Host ${this.handlingServerIP}:${this.handlingServerPort}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Closing the client because the handling server closed without a response MTI ${this.unpackedMessage.mti} rrn ${this.transactionDetails.rrn} terminal ${this.transactionDetails.terminalId} at ${new Date().toString()}, Host ${this.handlingServerIP}:${this.handlingServerPort}`);
                
                    if (this.unpackedMessage.mti == '0200') {
                        //////// testing
                        if (this.allow_failover == 'y' || this.config) {
                            // get terminal keys from db
                            let terminalId = Util.getTerminalId(this.unpackedMessage);
                            let terminal = await TerminalKey.findTerminal(terminalId);
                            if (terminal != null) {
                                // nibss 2 fall-over
                                let result = await this.processFailoverRequest(terminal,terminalId,99,theSocketClientInstance);
                                if(result === null) return;
                                if(result !== false && result !== null ){
                                    this.afterTransactionProcess(result,theSocketClientInstance);
                                    return;
                                }
                            }
        
                        }
                        ///////////////////
                        let msg = Util.getNibssResponseMessageFromCode("99");
                        await this.updateNoResponseTransaction("99", msg);
                    }

                this.socketServerInstance.end();

                this.handlerEvent.emit('noResponse', this.handlingModelInstance, this.transactionDetails);
                this.handlerEvent.emit('e-receipt', this.receiptData, this.transactionDetails);

                // send notification when host close connection on reversal (could be because the host terminal needs to reprep)
                if(this.unpackedMessage.mti == '0420')
                {
                    EmailNotifier.sendPrepErrorAlert(`Hi Austin, it seems the Keys on this Terminal : ${this.transactionDetails.terminalId} has been invalidated by another terminal using the same TID , kindly advice the merchant to re-prep the terminal. Thanks`,this.transactionDetails.terminalId);
                }
                else if(Util.getTerminalId(this.unpackedMessage) && this.unpackedMessage.mti == '0200')
                {
                    EmailNotifier.sendErrorAlert(`Closing the client because the handling server closed without a response MTI ${this.unpackedMessage.mti} rrn ${this.transactionDetails.rrn} terminal ${this.transactionDetails.terminalId} at ${new Date().toString()}, Host ${this.handlingServerIP}:${this.handlingServerPort}`);
                }
                ///////////////////////////////
            }

        });

        theSocketClientInstance.on('timeout', async () => {

            if (this.socketServerInstanceClosed !== true && this.handlingServerReplied !== true && !this.retrying) {
                this.retrying = true;
                console.error(`Closing Timed out client because the handling server timed-out without a response MTI ${this.unpackedMessage.mti} rrn ${this.transactionDetails.rrn} terminal ${this.transactionDetails.terminalId} at ${new Date().toString()}, Host ${this.handlingServerIP}:${this.handlingServerPort}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Closing Timed out client because the handling server timed-out without a response MTI ${this.unpackedMessage.mti} Config on TID: ${JSON.stringify(this.config)} rrn ${this.transactionDetails.rrn} terminal ${this.transactionDetails.terminalId} at ${new Date().toString()}, Host ${this.handlingServerIP}:${this.handlingServerPort}`);
                if (this.unpackedMessage.mti == '0200') {

                    if (this.allow_failover == 'y' || this.config) {
                        // add 100 to bank failover resonses to failover on timout
                        if (this.bankFailoverResponses.includes("100")) {
                            // get terminal keys from db
                            let terminalId = Util.getTerminalId(this.unpackedMessage);
                            let terminal = await TerminalKey.findTerminal(terminalId);
                            
                            if (terminal != null) {
                                // nibss 2 fall-over
                                let result = await this.processFailoverRequest(terminal, terminalId, 100, theSocketClientInstance);
                                if (result === null) return;
                                if (result !== false && result !== null) {
                                    this.afterTransactionProcess(result, theSocketClientInstance);
                                    return;
                                }
                            }
                        }
                    }
                    
                    let msg = Util.getNibssResponseMessageFromCode("100");
                    await this.updateNoResponseTransaction("100", msg);
                }
                
                theSocketClientInstance.end();
                
                this.socketServerInstance.end();

                this.handlerEvent.emit('timeout', this.handlingModelInstance, this.transactionDetails);
                this.handlerEvent.emit('e-receipt', this.receiptData, this.transactionDetails);

                EmailNotifier.sendCriticalErrorAlert(`Closing the client because the handling server timed-out without a response MTI ${this.unpackedMessage.mti} rrn ${this.transactionDetails.rrn} terminal ${this.transactionDetails.terminalId} at ${new Date().toString()}, Host ${this.handlingServerIP}:${this.handlingServerPort}`);
            }

        });
        
        this.socketServerInstance.on('error',err =>{
            if(err.toString().includes('write after end')){
                
                console.error('unable to write to POS');
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'unable to write to POS');

                if(this.handlingModelInstance)
                    this.handlingModelInstance.write2pos = '06';
                this.transactionDetails.write2pos = '06';

                Journal.updateWriteError(this.transactionDetails);
            }
        })
        
        }catch(err){
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `Error occured:::${JSON.stringify(err)}`);
            return false;
        }

    }



    async setUpClientSocket() {
        let theSocketClient = new SocketClient(this.handlingServerIP, this.handlingServerPort, this.handlingServerTLSEnabled);

        // check if it's a 0200 message and it not failover request
        if (Util.isMitType(this.unpackedMessage, '02') && !this.retrying) {
            let terminalId = Util.getTerminalId(this.unpackedMessage);
            let terminal = null;

            // switch rrn and rehash message if neolife is true;
            if (this.isNeolife || this.isFrsc || this.isSterling || this.clearCustRef) {
                terminal = await TerminalKey.findTerminal(terminalId);

                // terminate transaction if message cannot be rehashed with nibbs1 keys
                if (!Util.hasNibss1OfflineKeys(terminal)) {
                    this.socketServerInstance.end();
                    return;
                }

                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                this.requestData = await ExtractKeys.rehashIsoUniquRRNMessage(this.requestData.toString(), this.isoParser, clearSessionKey, this.unpackedMessage.dataElements[37],(this.isFrsc || this.isSterling || this.clearCustRef));
            }

            // check for bank config setup
            this.config = await BankConfigs.getConfig(terminalId, this.handlerUsed);
            // console.log(this.config, "Config data => ");
            // Util.fileDataLogger(terminalId, ` Before if check Configuration for terminals routed to Failover ${JSON.stringify(this.config)} for failover`);

            if (this.config) {
                // this.nibss2failoverEnabled = this.config.useNibss_2;
                // Util.fileDataLogger(terminalId, `Configuration for terminals routed to Failover ${JSON.stringify(this.config)} for failover`);
                let useSelected = Util.checkFailoverSelected(this.config,this.unpackedMessage);
                if (useSelected == true) {
                    this.tamsfailoverEnabled = this.config.useTams || false;
                    this.interswitchEnabled = this.config.useInterswitch || false;
                    this.tamsPriority = this.config.tamsPriority || false;
                    this.upslEnabled =  this.config.useUpsl || false;
                    this.noAttemptNibss = this.config.noAttemptNibss || false;
                    this.bankFailoverResponses = this.config.responses || [];
                }

                if (this.config.useNibss_1 == false && this.config.useNibss_2 == true) {

                    if (terminal == null)
                        terminal = await TerminalKey.findTerminal(terminalId);

                    if (Util.canDoNibss2Online(terminal)) {
                        this.nibss2failoverEnabled = false;
                        this.nibss1Enabled = false;
                        let pinBlock = Util.getPinBLock(this.unpackedMessage);
                        if (pinBlock == null) {
                            this.requestData = await this.rehashNibss2RequestDataOffline(terminal, false);
                        } else {
                            this.requestData = await this.rehashNibss2RequestDataOnline(terminal, false);
                        }
                        // Util.fileDataLogger(terminalId, `Checking the IP ${process.env.HANDLER_EPMS_2_PUBILC_IP} and PORT ${process.env.HANDLER_EPMS_2_TLS_PORT} for failover`);
                        theSocketClient.serverHost = process.env.HANDLER_EPMS_2_PUBILC_IP;
                        theSocketClient.serverPort = process.env.HANDLER_EPMS_2_TLS_PORT;
                        this.handlingServerIP = process.env.HANDLER_EPMS_2_PUBILC_IP;
                        this.handlingServerPort = process.env.HANDLER_EPMS_2_TLS_PORT;
                        // Util.fileDataLogger(terminalId, `Handling Server IP at failover ${process.env.HANDLER_EPMS_2_PUBILC_IP} and Handling PORT ${process.env.HANDLER_EPMS_2_TLS_PORT} for failover`);
                    }
                }
            }
        }

        //temporary for orangebox
        let orangebox_tid = process.env.orangebox_tids || "";
        let orangebox_tids = orangebox_tid.split(',');
        let terminalId = Util.getTerminalId(this.unpackedMessage);

        if (orangebox_tids.includes(terminalId) && this.handlerUsed == "EPMS") {
            console.log(`orangebox ${Util.getProcessingCode(this.unpackedMessage)}`);
            theSocketClient.serverHost = process.env.HANDLER_EPMS_2_PUBILC_IP;
            theSocketClient.serverPort = process.env.HANDLER_EPMS_2_TLS_PORT;
            this.handlingServerIP = process.env.HANDLER_EPMS_2_PUBILC_IP;
            this.handlingServerPort = process.env.HANDLER_EPMS_2_TLS_PORT;
            this.handlerUsed = Util.handlers.nibss2;

            if(Util.getProcessingCode(this.unpackedMessage) == Util.GParamProcessingCode){
                let terminal = await TerminalKey.findTerminal(terminalId);
                if(Util.hasNibss1OfflineKeys(terminal)){
                    this.requestData = await this.rehashEPMSforPOSVASOffline(terminal, false);
                }
            }

            if(Util.isMitType(this.unpackedMessage, '02') && !this.retrying){
                let terminal = await TerminalKey.findTerminal(terminalId);
                if (Util.hasNibss1OnlineKeys(terminal)) {
                    this.nibss2failoverEnabled = false;
                    this.nibss1Enabled = false;
                    let pinBlock = Util.getPinBLock(this.unpackedMessage);
                    if (pinBlock == null) {
                        this.requestData = await this.rehashEPMSforPOSVASOffline(terminal, false);
                    } else {
                        this.requestData = await this.rehashEPMSforPOSVASOnline(terminal, false);
                    }
                }
            }
        }
        /////temporary for orangebox///////

        return theSocketClient;
    }

    /**
     * @param {Object} terminal terminal object from db
     * @param {Boolean} offline if the card is offline or online
     * @returns {Buffer} isomessage
     */
    async handleInterswitchFailOver(terminal, offline = true) {

        try {
            let interswitchHandler = new InterswitchHandler();
            this.interswitchHandler = interswitchHandler;
            let response = null, iswUnpackedResponse = null;
            if (offline) {
                response = await interswitchHandler.sendOfflineFailoverTransaction(this.unpackedMessage, true);
                // response = await interswitchHandler.sendOfflineFailoverTransaction(this.requestData, true);
                // response = await interswitchHandler.sendOfflineTransaction(this.unpackedMessage);
            } else {
                response = await interswitchHandler.sendOnlineFailOverTransaction(this.unpackedMessage, terminal, this.handlerUsed,true);
                // response = await interswitchHandler.sendOnlineTransaction(this.unpackedMessage, terminal);
            }

            // handle response
            if (response) {
                this.handlerUsed = Util.handlers.interswitchFailover;
                this.transactionDetails.interSwitchResponse = response.resCode;
                this.transactionDetails.authCode = response.authCode || '';

                // use fail-over response as the responseCode
                // this.unpackedHandlingServerMessage.dataElements[39] = response.resCode;
                // this.unpackedHandlingServerMessage.dataElements[55] = response.iccResponse || null;

                // do reversal
                let getNibssResponseCode = Util.getNibssResponseMessageFromCode(response.resCode);
                if (getNibssResponseCode == "unknown" || 
                    getNibssResponseCode == "no Response" ||
                    getNibssResponseCode == "Request Timedout") {
                        this.unpackedMessage.mti = "0420";
                        Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `Got to reverse Transaction`);
                    if (offline) {
                        interswitchHandler.sendOfflineFailoverReversalTransaction(this.unpackedMessage, true)
                        .then(res => {
                            // console.log('Reversal done');
                            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `OFfline Reversal done for ${res}`);
                            // TO DO
                            // Update the database of the Reversal.
                        }).catch(e => {
                            console.error('error', JSON.stringify(e));
                        })
                        // interswitchHandler.sendTransactionOfflineReversal(this.unpackedMessage)
                    } else {
                        interswitchHandler.sendOnlineFailOverReversalTransaction(this.unpackedMessage, terminal, this.handlerUsed, true)
                        .then(onlineRes => {
                            //TO DO
                            //UPdate the reversal to database.
                            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `Online Reversal done for ${onlineRes}`);
                        })
                        .catch(e => {
                            console.error('error', JSON.stringify(e));
                        })
                        //Fix for Online Reversals
                        // if(response){
                        //     iswUnpackedResponse = response.response;
                        //     response = response.responseData;
                        //     // console.log(JSON.stringify(iswUnpackedResponse), 'ISW unpacked Response');
                        //     //Remove somethings here.
                        //     iswUnpackedResponse.dataElements[127] = null;
                        //     iswUnpackedResponse.dataElements[59] = null;
                        //     //Replace the rrn field in request data with
                        //     Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `Failed transaction trying to Reverse ${JSON.stringify(iswUnpackedResponse)}, ${JSON.stringify(response)}`);
                        //     let originalMessageUnpacked = this.isoParser.unpack(this.requestData.toString().substr(2));
                        //     // console.log(originalMessageUnpacked, 'Unpacked ORIGINAL msg');
                        //     originalMessageUnpacked.dataElements[37] = iswUnpackedResponse.dataElements[37];
                        //     // console.log(originalMessageUnpacked, 'Unpacked ORIGINAL msg AFTER CHANGE');
                        //     this.requestData = this.isoParser.pack("0420",originalMessageUnpacked.dataElements).isoMessage;
                        //     // let newHash = Util.signIsoMessage(clearSessionKey, this.requestData);
                        //     // this.requestData = this.requestData + newHash;
                        //     let length = Util.getLengthBytes(this.requestData.length);
                        //     this.requestData = Buffer.concat([length, Buffer.from(this.requestData,'utf8')]);
                        // }
                        //Above is to overwrite requestData for online Card Reversal
                    }
                }
                ////reversal/////

                // try tams if tams is enable but not a proriity
                //Disable trying tams
                // if (Util.isFailoverResponse(response.resCode,this.bankFailoverResponses) && this.tamsfailoverEnabled && this.tamsPriority == false && Util.canDoTamsFallover(terminal, this.config) && ((Util.hasNibss1OnlineKeys(terminal) && offline == false) || (Util.hasNibss1OfflineKeys(terminal) && offline == true))) {
                //     let tamsResult = await this.handleTamsFailOver(terminal, offline);
                //     if (tamsResult) {
                //         return tamsResult;
                //     }
                // }

                // return interswitch response to the pos
                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                // Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `Request data for rehashing ISW Resp${this.requestData.toString()}`);
                let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponseFromInterswitch(this.requestData.toString(), clearSessionKey, this.isoParser, response);
                //Set unpacked message from ISW response
                this.unpackedHandlingServerMessage = this.unpack(rehashWithNibbs1Key.toString().substring(2));
                Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `handle ISW fxn return ::::${JSON.stringify(this.unpackedHandlingServerMessage)}`);
                return rehashWithNibbs1Key;
            }
            return false;

        } catch (err) {
            console.error(`Error occur while routing trnsaction throught INTERSWITCH at ${new Date().toString()} error : ${err.toString()}`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Error occured while handling ISW Failover at ${new Date().toString()} error String: ${err.toString()} and json string ${JSON.stringify(err)}`);
            return false;
        }

    }

 /**
     * @param {Object} terminal terminal object from db
     * @param {Boolean} offline if the card is offline or online
     */
    async handleTamsFailOver(terminal, offline = true) {
        try {

            let tamsHandler = new TamsHandler(this.config, this.unpackedMessage, this.isoParser);
            if (this.config.tams.TAMS_DIRECT == true) {
                let reqData = await tamsHandler.mapTransactionData(terminal, nibssVer);
                this.tamsHandler = tamsHandler;
                this.tamsRequestData = reqData;
    
                let result = await tamsHandler.processTransaction(reqData, terminal);
                if (result) {
                    this.handlerUsed = Util.handlers.tams;
    
                    this.transactionDetails.tamsBatchNo = result.batchNo;
                    this.transactionDetails.tamsTransNo = result.tranNo;
                    this.transactionDetails.tamsStatus = result.status;
                    this.transactionDetails.tamsMessage = result.message;
                    this.transactionDetails.authCode = result.authId;
                    this.transactionDetails.tamsRRN = result.rrn;
                    // console.log(`tams RRN : ${result.rrn}`);
                    // use fail-over response as the responseCode
                    let mappedResponseCode = Util.mapTamsResToNibss(result.status);
                    this.unpackedHandlingServerMessage.dataElements[39] = mappedResponseCode;
                    this.unpackedHandlingServerMessage.dataElements[55] = result.iccResponse || null;
    
                    console.log(`TAMS response : ${mappedResponseCode} at ${new Date().toString()}`);
                    Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`TAMS DIRECT response : ${mappedResponseCode} at ${new Date().toString()}`);
    
                    if (mappedResponseCode != '00') {
    
                        if (mappedResponseCode == "06")
                            this.handleTamsReversal(tamsHandler, terminal, reqData);
    
                        // try interswitch if interswitch is enable but not a proriity
                        if (Util.isFailoverResponse(mappedResponseCode,this.bankFailoverResponses) && this.interswitchEnabled && this.tamsPriority == true && ((Util.hasNibss1OnlineKeys(terminal) && offline == false) || (Util.hasNibss1OfflineKeys(terminal) && offline == true))) {
                            let interResult = await this.handleInterswitchFailOver(terminal, offline);
                            if (interResult) {
                                return interResult;
                            }
                        }
                    }
    
                    // re-hash response for POS
                    let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                    let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponseFromTams(this.requestData.toString(), clearSessionKey, this.isoParser, mappedResponseCode, result);
                    return rehashWithNibbs1Key;
    
                }
            }
            else{
                
                let response = await tamsHandler.processMiddleWareTAMSTransaction(terminal);
                this.unpackedHandlingServerMessage = this.unpack(response.toString().substring(2));
                //TODO check response here if not approved. Route to ISW.
                // this.unpackedHandlingServerMessage.dataElements[39]
                
                this.transactionDetails.tamsRRN = this.unpackedHandlingServerMessage.dataElements[37];

                this.handlerUsed = Util.handlers.tamsMW;

                let tamsRes = this.unpackedHandlingServerMessage.dataElements[62] || "";
                let splitRes = tamsRes.split("|");
                this.transactionDetails.tamsStatus = splitRes[0];
                if(splitRes.length>1)
                    this.transactionDetails.tamsMessage = splitRes[1];

                return response;
            }

        } catch (err) {
            console.error(`Error occur while routing transaction throught Middle-TAMS at ${new Date().toString()} error : ${err.toString()}`);
            EmailNotifier.sendErrorAlert(`Error occur while routing transaction throught Middle-TAMS at ${new Date().toString()} error : ${err.toString()}`);
        }

        return false;
    }



    handleTamsReversal(tamsHandler, terminal, reqData) {
        tamsHandler.processReversal(reqData, terminal)
            .then(result => {
                if (result) {
                    Journal.SaveTamsReversal(this.unpack(this.requestData.toString().substr(2)), this.transactionDetails.tamsTransNo, result, (err, res) => {
                        if (err)
                            console.error(`Error saving TAMS reversal response data: ${err.toString()}`)
                        else {
                            console.log('TAMS reversal completed');
                            console.log(res);
                        }
                    });
                }
            })
            .catch(e => {
                console.error(`error on tams reversal: ${e.toString()}`);
            })
    }

    handleNibssReversals(hashKey) {
        let reversalRequestData = ExtractKeys.reshashIsoMessageForReversal(this.requestData.toString(), hashKey, this.isoParser);
        let reversalModel;
        Journal.SaveReversalRequest(this.unpack(reversalRequestData.toString().substr(2)), this.handlerName, (err, res) => {
            if (err)
                console.error(`Error saving reversal request data: ${err.toString()}`)
            else {
                console.log(`Processing NIBSS Reversal at ${new Date().toString()}`);
                console.log(res);
                reversalModel = res;
            }

        });

        let reversalClient = new SocketClient(this.handlingServerIP, this.handlingServerPort, this.handlingServerTLSEnabled);
        let reversalClientInstance = reversalClient.startClient(reversalRequestData);
        let response = '';

        reversalClientInstance.on('data', async (data) => {

            response += data;
            if (response.toString().length < 3)
                return

            let unpackRes = this.unpack(response.toString().substr(2));

            if (reversalModel) {

                reversalModel.messageReason = Util.getNibssResponseMessageFromCode(unpackRes.dataElements[39]),
                    reversalModel.responseCode = unpackRes.dataElements[39],
                    reversalModel.authCode = unpackRes.dataElements[38],
                    reversalModel.handlerResponseTime = new Date

                Journal.updateReversalResponse(reversalModel, (err, res) => {
                    if (err){
                        Util.fileDataLogger(unpackRes.dataElements[41], `Error updating Reversal response`);
                        console.error(`Error updating reversal response data: ${err.toString()}`)
                    }else {
                        console.log('Reversal before fail-over completed');
                        Util.fileDataLogger(unpackRes.dataElements[41], `Success updating Reversal response`);
                        console.log(reversalModel);
                    }
                });
            }

        });

        reversalClientInstance.on('error', err => {
            reversalClientInstance.end();
            console.error(`error sending manual reversal: ${err.toString()}`);
        });
    }

    async rehashNibss2RequestDataOnline(terminal, isFailOver = true) {
        this.handlerUsed = Util.handlers.nibss2;
        let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
        let nibss1ClearPinkeyKey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, 1);
        let nibss2ClearPinkeyKey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_2, terminal.masterKey_2, 2);

        let newRequestData = await ExtractKeys.rehashIsoMessageOnlineCard(this.requestData.toString(), this.isoParser, clearSessionKey, nibss1ClearPinkeyKey, nibss2ClearPinkeyKey, isFailOver);
        return newRequestData;
    }

    async rehashNibss2RequestDataOffline(terminal, isFailOver = true) {
        this.handlerUsed = Util.handlers.nibss2;
        let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
        let newRequestData = await ExtractKeys.rehashIsoMessage(this.requestData.toString(), this.isoParser, clearSessionKey, isFailOver);
        return newRequestData;
    }

    ////temporary for orangebox////
    async rehashEPMSforPOSVASOnline(terminal, isFailOver = false) {
        this.handlerUsed = Util.handlers.nibss2;
        let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 2);
        let nibss1ClearPinkeyKey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, 1);
        let nibss2ClearPinkeyKey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, 2);

        let newRequestData = await ExtractKeys.rehashIsoMessageOnlineCard(this.requestData.toString(), this.isoParser, clearSessionKey, nibss1ClearPinkeyKey, nibss2ClearPinkeyKey, isFailOver);
        return newRequestData;
    }

    async rehashEPMSforPOSVASOffline(terminal, isFailOver = false) {
        this.handlerUsed = Util.handlers.nibss2;
        let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 2);
        let newRequestData = await ExtractKeys.rehashIsoMessage(this.requestData.toString(), this.isoParser, clearSessionKey, isFailOver);
        return newRequestData;
    }
    ////temporary for orangebox////

    async failedNotificationReveral(terminal) {
        if (this.handlerUsed == Util.handlers.nibss1) {
            let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
            this.handleNibssReversals(hashKey);
        } else if (this.handlerUsed == Util.handlers.nibss2) {
            let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
            this.handleNibssReversals(hashKey);
        } else if (this.handlerUsed == Util.handlers.tams) {
            this.handleTamsReversal(this.tamsHandler, terminal, this.tamsRequestData);
        }
        else if (this.handlerUsed == Util.handlers.interswitch) {
            let pinBlock = Util.getPinBLock(this.unpackedMessage);
            if (pinBlock) {
                this.interswitchHandler.sendTransactionOnlineReversal(this.unpackedMessage, terminal).then(() => {
                        console.log(`processing INTERSWITCH reversal`);
                    })
                    .catch(err => {
                        console.error(`error while processing INTERSWITCH Reversal ${err.toString()}`);
                    });
            } else {
                this.interswitchHandler.sendTransactionOfflineReversal(this.unpackedMessage);
            }
        }
    }

    async handleUpslFailover(terminal){
        try {
            this.handlerUsed = Util.handlers.upsl;
            let upslHandler = new UpslHandler(this.unpackedMessage, this.requestData, this.isoParser);

            let response = await upslHandler.sendTransactionRequest(terminal);

            // handle response
            if (response) {
                this.handlerUsed = Util.handlers.upsl;

                this.unpackedHandlingServerMessage = this.isoParser.unpack(response.toString().substr(2));

                this.transactionDetails.upslResponse = Util.getResponseCode(this.unpackedHandlingServerMessage);

                console.log("UPSL RESPONSE CODE => ", this.transactionDetails.upslResponse);

                console.log(`UPSL response : ${this.transactionDetails.upslResponse} at ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`UPSL response : ${this.transactionDetails.upslResponse} at ${new Date().toString()}`);

                // use fail-over response as the responseCode
                // do reversal
                if (Util.getNibssResponseMessageFromCode(this.transactionDetails.upslResponse) == "unknown") {
                    upslHandler.sendReversalTransactionRequest(terminal).then(() => {
                            console.log(`processing UPSL reversal`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `processing UPSL reversal`);
                        })
                        .catch(err => {
                            console.error(`error while processing UPSL Reversal ${err.toString()}`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `error while processing UPSL Reversal ${err.toString()}`);
                        });
                }
                ////reversal/////

                // return UPSL response to the pos
                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponse(response.toString(), clearSessionKey);

                // reversal simulation
                return rehashWithNibbs1Key;
                // return false;
            }
            return false;

        } catch (err) {
            console.error(`Error occur while routing trnsaction throught UPSL at ${new Date().toString()} error : ${err.toString()}`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Error occur while routing trnsaction throught UPSL at ${new Date().toString()} error : ${err.toString()}`);
            return false;
        }
    }

    /**
     * handles POS response, notification e.t.c
     * @param {Buffer} data data to be written to the POS socket
     * @param {Object} theSocketClientInstance client socket object {Nibss socket}
     */
    async afterTransactionProcess(data,theSocketClientInstance){
        let initialSaveUpdate = await this.updateSavedTransaction();
        
        //check if vas data and a reversal record already exists and return
        if((this.vasData || this.vas4Data) && this.unpackedHandlingServerMessage && this.unpackedHandlingServerMessage.mti === "0210"){
            const reversalCheck =  await Journal.checkReversalExists(this.transactionDetails);
            console.log("reversal after Transaction Process check ===>>", reversalCheck);
            if(reversalCheck) return
        }

        if (initialSaveUpdate === false) {
            console.error(`There was an error updating the initially saved transaction, aborting`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`There was an error updating the initially saved transaction, aborting`);
            if (this.isFrsc || this.isSterling || this.isNeolife) {
                this.socketServerInstance.end();
                if(theSocketClientInstance)
                    theSocketClientInstance.end();
                return false;
            }
        }

        ////for custom notification after transactions
        let responseMiddleware = new ResponseMiddleware(this.unpackedMessage, this.unpackedHandlingServerMessage, this.transactionDetails, this.vasData, this.remittaData, this.stanbicdstvData, this.vas4Data, this.jambprcData);
        if (responseMiddleware.isMiddlewareNeeded()) {

            let result = await responseMiddleware.preformMiddlewareActions();
            if (result.isSuccess == false && result.errorDoReversal == true) {
                let terminalId = Util.getTerminalId(this.unpackedMessage);
                let terminal = this.isVirtualTid === false ? await TerminalKey.findTerminal(terminalId) : this.virtualTidKeys;

                let keysversion = this.isVirtualTid === true ? "virtualtid" : 1;

                let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, keysversion);
                
                if (result.message)
                    data = ExtractKeys.rehashIsoResponseCustom(data.toString(), hashKey, this.isoParser,result.message, "99");
                else
                    data = ExtractKeys.rehashIso06ResponseCode("0210", data.toString(), hashKey, this.isoParser, "06");
    
                //do reversal
                this.failedNotificationReveral(terminal)
                    .then(res => {
                        console.error(`Initiate reversal on failed notification ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`);
                        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Initiate reversal on failed notification ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`);
                    })
                    .catch(err => {
                        console.log(err.toString());
                        console.error(`Initiate reversal on failed notification error ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`);
                        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Initiate reversal on failed notification error ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`);
                    });
            }
            else if(result.isSuccess != false && (this.isFrsc || this.isSterling || this.isRemita || this.isWemaCollect)){
                let terminalId = Util.getTerminalId(this.unpackedMessage);
                let terminal = await TerminalKey.findTerminal(terminalId); 
                let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                data = ExtractKeys.rehashIsoResponseForFrsc(data.toString(), hashKey, this.isoParser, result.isSuccess);
            }            
            else if(this.vasData != null || this.vas4Data != null || this.stanbicdstvData != null || this.jambprcData != null) {
                let vasRes = result.isSuccess;
                // console.log('response coming from VAS', vasRes);
                if(vasRes != false){
                    if(typeof vasRes == 'object'){ // check if data is an object
                        vasRes = JSON.stringify(vasRes);
                        data = ExtractKeys.buildIsowithVasResponse(data,vasRes);
                    }
                }

            }
        }
        ///////////////////////////////

        //console.warn(`Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`, Util.truncateData(data.toString()));
        // console.log(`logging string Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`, Util.truncateData(data.toString()));
        
        // handle response from ISW to change 55 to 96 on POS.
        // if(this.transactionDetails.interSwitchResponse && this.transactionDetails.interSwitchResponse === "55"){
        //     let unpackedISWResponse = this.unpack(data.toString().substring(2));
        //     data = this.isoParser.pack(unpackedISWResponse.mti, unpackedISWResponse.dataElements);
        // }
        this.socketServerInstance.write(data);
        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}, ${data.toString()}`);

        // console.log("Complete data written to POS", data.toString());
        //Update database after writing to POS.

        this.socketServerInstance.end();

        this.socketServerInstanceClosed = true;

        if(theSocketClientInstance)
            theSocketClientInstance.end();
        
        this.handlerEvent.emit('complete', this.handlingModelInstance, this.transactionDetails);
        this.handlerEvent.emit('e-receipt', this.receiptData, this.transactionDetails);
    }

    ///failover handler
    /**
     * 
     * @param {Object} terminal terminal keys object from the DB.
     * @param {String} terminalId terminal Id
     * @param {*} responseCode old response code 06|14|99|100(timeout)
     */
    async processFailoverRequest(terminal,terminalId,responseCode,theSocketClientInstance,afterNibss = true) {
        // Util.fileDataLogger(terminalId, `NIBSS2 Enabled: ${this.nibss2failoverEnabled} ${JSON.stringify(terminal)}`);

        if (this.RetriesDone < 1 && this.nibss2failoverEnabled) {
            this.RetriesDone += 1;

            // do offline nibss 2 fall-over
            let pinBlock = Util.getPinBLock(this.unpackedMessage);
            if (pinBlock == null && Util.canDoNibss2Offline(terminal) && Util.hasNibss1OfflineKeys(terminal)) {
           
                // do reversal before retrying
                let nibss1clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                // Util.fileDataLogger(terminalId, `1st FAILOVER Condition: ${this.nibss2failoverEnabled}`);
                if(afterNibss){
                    this.handleNibssReversals(nibss1clearSessionKey);
                    // Util.fileDataLogger(terminalId, `After NIBSS Reversal 1st FAILOVER Condition: ${this.nibss2failoverEnabled}`);
                }

                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');
                /**
                 * uncomment for test
                 * */
                // this.requestData = this.requestData.toString().replace("####", "9F02");
                this.requestData = await this.rehashNibss2RequestDataOffline(terminal);

                // set the Client socket IP to nibss 2
                this.handlingServerIP = process.env.HANDLER_EPMS_2_PUBILC_IP;
                this.handlingServerPort = process.env.HANDLER_EPMS_2_TLS_PORT;

                console.warn(`NIBSS responseCode : ${responseCode}, retrying NIBSS_2 IP OFFLINE, TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying NIBSS_2 IP OFFLINE, TERMINAL ID: ${terminalId}, After NIBSS Reversal 1st FAILOVER Condition: RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);

                // close the current client socket
                if(theSocketClientInstance)
                    theSocketClientInstance.end();

                // recall the handle function
                await this.handle();

                this.retrying = true;

                return null;
            } 
            else if (pinBlock != null && Util.canDoNibss2Online(terminal) && Util.hasNibss1OnlineKeys(terminal)) {
           
                // do reversal before retrying
                let nibss1clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                if(afterNibss)
                    this.handleNibssReversals(nibss1clearSessionKey);
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');
                // do online nibss 2 fall-over

                /**
                 * uncomment for test
                 * 
                 */
                // this.requestData = this.requestData.toString().replace("####", "9F02");
                this.requestData = await this.rehashNibss2RequestDataOnline(terminal);
                // set the Client socket IP to nibss 2
                this.handlingServerIP = process.env.HANDLER_EPMS_2_PUBILC_IP;
                this.handlingServerPort = process.env.HANDLER_EPMS_2_TLS_PORT;

                console.warn(`NIBSS responseCode : ${responseCode}, retrying NIBSS_2 IP ONLINE, TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying NIBSS_2 IP ONLINE, TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                // close the current client socket
                if(theSocketClientInstance)
                    theSocketClientInstance.end();

                this.retrying = true;

                // recall the handle function
                await this.handle();
                return null;
            } 
            else if (pinBlock == null && Util.canDoTamsFallover(terminal, this.config) && Util.hasNibss1OfflineKeys(terminal) && this.tamsfailoverEnabled && this.tamsPriority) {
                // do reversal before retrying
                let nibss1clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                if(afterNibss)
                    this.handleNibssReversals(nibss1clearSessionKey);

                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do offline tams directly(if you can't do nibss, because we don't have the neccessary keys)
                console.warn(`NIBSS responseCode : ${responseCode}, retrying TAMS OFFLINE, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying TAMS OFFLINE, 2nd FAILOVER Condition::: TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);

                let result = await this.handleTamsFailOver(terminal);
                Util.fileDataLogger(terminalId, `2nd FAILOVER Condition::: Can do TAMS failover`);
                if (result) {
                    return result;
                }

            } 
            else if (pinBlock != null && Util.canDoTamsFallover(terminal, this.config) && Util.hasNibss1OnlineKeys(terminal) && this.tamsfailoverEnabled && this.tamsPriority) {
            
                // do reversal before retrying
                let nibss1clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                if(afterNibss)
                    this.handleNibssReversals(nibss1clearSessionKey);

                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do online tams directly(if you can't do nibss, because we don't have the neccessary keys)
                console.warn(`NIBSS responseCode : ${responseCode}, retrying TAMS ONLINE, TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying TAMS ONLINE, 3rd Failover Condition TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);

                let result = await this.handleTamsFailOver(terminal, false);
                if (result) {
                    return result;
                }

            } 
            else if (pinBlock == null && Util.hasNibss1OfflineKeys(terminal) && this.interswitchEnabled) {
             
                // do offline interswitch directly

                // do reversal before retrying
                let nibss1clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                if(afterNibss)
                    this.handleNibssReversals(nibss1clearSessionKey);

                //  ...
                console.warn(`NIBSS responseCode : ${responseCode}, retrying TAMS ONLINE, TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying ISW ONLINE, 4th Failover Condition TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                let result = await this.handleInterswitchFailOver(terminal);
                if (result) {
                    return result;
                }

            } 
            else if (pinBlock != null && Util.hasNibss1OnlineKeys(terminal) && this.interswitchEnabled) {
                // do online interswitch directly
        
                // do reversal before retrying
                let nibss1clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                
                
                if(afterNibss)
                    this.handleNibssReversals(nibss1clearSessionKey);

                    console.warn(`NIBSS responseCode : ${responseCode}, retrying TAMS ONLINE, TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                    Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying ISW OFFLINE, 5th Failover Condition TERMINAL ID: ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                let result = await this.handleInterswitchFailOver(terminal, false);
                if (result) {
                    return result;
                }
            }

        }
        else if ((this.RetriesDone == 1 || this.nibss2failoverEnabled == false) && this.tamsfailoverEnabled && ((this.nibss2failoverEnabled == false && Util.hasNibss1OfflineKeys(terminal)) || (this.nibss2failoverEnabled == true && Util.canDoNibss2Offline(terminal))) && this.tamsPriority == true) {
       
            // do tams fall-over
            this.RetriesDone += 1;

            // do reversal before retrying
            let hashKey = '';
            if (this.nibss2failoverEnabled == true)
                hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
            else {
                hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
            }
            // console.log(hashKey);
            // Util.fileDataLogger(terminalId, `2nd FAILOVER Condition::: `);
            // if(afterNibss)
                // this.handleNibssReversals(hashKey);

            /**
             * uncomment for test
             */
            // this.requestData = this.requestData.toString().replace("####", "9F02");

            let pinBlock = Util.getPinBLock(this.unpackedMessage);

            if (pinBlock == null && Util.canDoTamsFallover(terminal, this.config) && Util.hasNibss1OfflineKeys(terminal)) {
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do offline tams
                console.warn(`NIBSS responseCode : ${responseCode}, retrying TAMS OFFLINE, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying TAMS OFFLINE, 1st Sub Condition for Tams Failover in 2nd FAILOVER Condition:::  TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);

                let result = await this.handleTamsFailOver(terminal);
                // Util.fileDataLogger(terminalId, ``);
                if (result) {
                    console.log(result, 'result From TAMS failover');
                    return result;
                }

            } 
            else if (pinBlock != null && Util.canDoTamsFallover(terminal, this.config) && Util.hasNibss1OnlineKeys(terminal)) {
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do online tams
                console.warn(`NIBSS responseCode : ${responseCode}, retrying TAMS ONLINE, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying TAMS ONLINE, 2nd Sub Condition for Tams Failover in 2nd FAILOVER Condition::: , TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                // Util.fileDataLogger(terminalId, `2nd Sub Condition for Tams Failover in 2nd FAILOVER Condition::: `);
                let result = await this.handleTamsFailOver(terminal, false);
                if (result) {
                    console.log(result, 'result From TAMS ONLINE failover');
                    //Check if it is bad result - route to ISW failover.
                    return result;
                }
            }
        } 
        else if (this.RetriesDone <= 1 && this.interswitchEnabled && Util.hasNibss1OfflineKeys(terminal)) {
            // do interswitch fall-over
            this.RetriesDone += 1;
            /**
             * uncomment for test
             */
            // this.requestData = this.requestData.toString().replace("####", "9F02");

            // do reversal before retrying
            let hashKey = '';
            // if (this.nibss2failoverEnabled == true)
            //     hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
            // else {
                hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
            // }
            // do reversal before fail-over
            // if(afterNibss)
            //     this.handleNibssReversals(hashKey);

            let pinBlock = Util.getPinBLock(this.unpackedMessage);

            if (pinBlock == null && Util.hasNibss1OfflineKeys(terminal)) {
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do offline interswitch
                console.warn(`NIBSS responseCode : ${responseCode}, retrying INTERSWITCH OFFLINE, 1st Sub Condition for ISW Failover in 3rd FAILOVER Condition:::, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                // offline
                Util.fileDataLogger(terminalId, `NIBSS responseCode : ${responseCode}, retrying INTERSWITCH OFFLINE, 1st Sub Condition for ISW Failover in 3rd FAILOVER Condition:::, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                let result = this.handleInterswitchFailOver(terminal);
                //Modified Buffer is returned as response from ISW.
                if (result) {
                    return result;
                }

            } else if (pinBlock != null && Util.hasNibss1OnlineKeys(terminal)) {
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do online interswitch
                console.warn(`NIBSS responseCode : ${responseCode}, retrying INTERSWITCH ONLINE, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying INTERSWITCH ONLINE, 2nd Sub Condition for ISW Failover in 3rd FAILOVER Condition:::  TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                // online
                let result = this.handleInterswitchFailOver(terminal, false);
                if (result) {
                    return result;
                }

            }
        }
        else if (this.RetriesDone <= 1 && this.upslEnabled && terminal.upslKey != null && Util.hasNibss1OfflineKeys(terminal)) {
            // do UPSL fall-over
            this.RetriesDone += 1;
            /**
             * uncomment for test
             */
            // this.requestData = this.requestData.toString().replace("####", "9F02");

            // do reversal before retrying
            let hashKey = '';
            if (this.nibss2failoverEnabled == true)
                hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
            else {
                hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
            }
            // do reversal before fail-over
            this.handleNibssReversals(hashKey);

            let pinBlock = Util.getPinBLock(this.unpackedMessage);

            if (pinBlock == null && Util.hasNibss1OfflineKeys(terminal)) {
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do offline upsl
                console.warn(`NIBSS responseCode : ${responseCode}, retrying UPSL OFFLINE, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(terminalId,`NIBSS responseCode : ${responseCode}, retrying UPSL OFFLINE, 1st Sub Condition for UPSL Failover in 4th FAILOVER Condition::: TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                // offline
                let result = await this.handleUpslFailover(terminal);
                // Util.fileDataLogger(terminalId, `1st Sub Condition for UPSL Failover in 4th FAILOVER Condition::: `);

                console.log('UPSL HASH RESPONSE DATA', result.toString());

                if (result) {
                    return result;
                }
                return false;

            } else if (pinBlock != null && Util.hasNibss1OnlineKeys(terminal)) {
                // keep old response
                this.transactionDetails.oldResCode ? (this.transactionDetails.oldResCode += responseCode + ',') : (this.transactionDetails.oldResCode = responseCode + ',');

                // do online upsl
                console.warn(`NIBSS responseCode : ${responseCode}, retrying UPSL ONLINE, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`NIBSS responseCode : ${responseCode}, retrying UPSL ONLINE, 2nd Sub Condition for UPSL Failover in 4th FAILOVER Condition:::, TERMINAL ID ${terminalId}, RRN : ${Util.getRRN(this.unpackedMessage)} at: ${new Date().toString()}`);
                // Util.fileDataLogger(terminalId, `2nd Sub Condition for UPSL Failover in 4th FAILOVER Condition::: `);

                
                let result = await this.handleUpslFailover(terminal);
                if (result) {
                    return result;
                }
                return false;
            }

        }
        return false;
    }
    /////////////////////


}

module.exports = BaseHandler;
