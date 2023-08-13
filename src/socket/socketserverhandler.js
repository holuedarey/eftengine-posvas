require("dotenv").config();
const cISO8583 = require('../ciso8583/CISO');
const requestTypes = require('../config/requesttypes');
const Util = require('../helpers/Util');
const TamsHandler = require('../handlers/tamsHandler');
const BankConfigs = require('../model/bankconfigModel');
const VasHandler = require('../handlers/vasHandler');
const { sendSocketNotification, socketDataType } = require('../socket/dataSocket');
const Pm2Io = require('@pm2/io');
const mongoose = require('mongoose');
const disabledTids = require('../config/disabled-tids.json');
const disabledReversals = require('../config/disable-reversal-tids.json');
const preAuthTids = require('../config/pre-auth-tids.json');
const enyoTids = require('../config/enyo-tids.json');

const UPSL = require('../handlers/upslHandler');
const UPSL_Direct = require('../handlers/direct/UplsDirectHandler');
const InterSwitch_Direct = require('../handlers/direct/InterswitchDirectHandler');
const InterSwitch_Rerouter = require('../handlers/interswitchRerouteHandler');
const RequestMiddleware = require('../helpers/RequestMiddleware');
const ExtractKeys = require('../helpers/ExtractKeys');
const UpslRerouter = require("../handlers/UpslRerouteHandler")
const { v4: uuidv4 } = require('uuid');
const Journal= require("../model/journalmodel")
const AccessRerouter = require('../handlers/reRouteAccessBankHandler');
const restrictedJournal = require('../model/restrictedJournalModel');
const directcardConfigModel = require('../model/directCardConfigModel');
const PosvasRouter = require('../handlers/posvasRerouter');
const TerminalKey = require('../model/terminalkeysModel');

class SocketServerHandler {

    constructor(handlers, socketServerInstance, tlsEnabled = false, ...options) {

        this.socketServerInstance = socketServerInstance;
        this.tlsEnabled = tlsEnabled;
        this.handlerOptions = options;
        this.handlers = handlers;

        this.meter = Pm2Io.meter({
            name: 'req/sec',
            type: 'meter',
        });
    }

    handleSocketServerInstance() {

        let connectionEventType = (this.tlsEnabled ? 'secureConnection' : 'connection');

        this.socketServerInstance.on(connectionEventType, (socket) => {

            // monitor req/sec
            this.meter.mark();

            // Identify this client
            socket.name = socket.remoteAddress + ":" + socket.remotePort;

            // console.log(`Received connection from ${socket.name}, TLS: ${this.tlsEnabled}`);

            this.handleSocketServerConnection(socket);

        });

    }

    handleSocketServerConnection(socketServerConnection) {
        let unpackedMessage = null;
        let rawData = '';
        let requestTime = '';
        let hexRequest = '';
        let extra = null;


        socketServerConnection.on('data', async (data) => {
            ////// for error logging
            if(process.env.ROUTE_TO_POSVAS_1 === "TRUE"){
                let iso8583Parser = new cISO8583();
                unpackedMessage = iso8583Parser.unpack(data.toString().substring(2));
                // console.log(unpackedMessage, 'UNPACKED MSG');
                console.log('posvas ip', process.env.POSVAS_REROUTE_IP);
                console.log('posvas ip', process.env.POSVAS_REROUTE_PORT);
    
                const posvasRouter = new PosvasRouter(process.env.POSVAS_REROUTE_IP, process.env.POSVAS_REROUTE_PORT, true, socketServerConnection, data)
                await posvasRouter.sendDataToPosVas();
                return false;
            }
            rawData = data.toString();
            requestTime = new Date().toString();
            //////////

            let rawDataToLog = data.toString().substr(2);

            if (process.env.APP_ENV == "local") {

                console.log(`Received Data POS: ${data.toString().substr(2)} from: ${socketServerConnection.name}, TLS: ${this.tlsEnabled}`);

            }

            let theMTI = data.toString().substr(2, 4);

            if (requestTypes[theMTI] === undefined || requestTypes[theMTI] === null) {
                console.log('Condition for MTI undefined entered...');
                // process JSON request
                // convert data to hex, check if data length is equal to sent lenght
                hexRequest += Buffer.from(data).toString('hex');
                try {

                    if (hexRequest.length < 4)
                        return;
                    let dataLength = Number.parseInt(hexRequest.substr(0, 4), 16);
                    let jsonRequest = Buffer.from(hexRequest.substr(4), 'hex').toString('utf8');
                    console.log('json Request...', jsonRequest);
                    if (jsonRequest.length < dataLength){
                        socketServerConnection.end();
                        return false;
                    }


                    let jsonData = JSON.parse(jsonRequest);
                    console.log(jsonData, 'jsonData after parsing json Request...');
                    if (jsonData['type'] == 'vasjournal') {
                        // save vas journal
                        console.log(`Processing VAS notification request.`);

                        let vasHandler = new VasHandler();
                        let result = await vasHandler.processVasJournal(jsonData);

                        if (result) {

                            let response = JSON.stringify({
                                status_code: "200",
                                status_message: "successful"
                            });

                            console.log(response, 'vas response added by Me...');

                            socketServerConnection.write(response);
                            console.log(`VAS report processed successfully at ${new Date().toString()}`);

                            // send data to live socket
                            sendSocketNotification(socketDataType.vasJournal, jsonData);
                        }

                    } else {
                        console.log('does it get to this else when jsondata is not vas journal??');
                        let errorResopnse = JSON.stringify({
                            status_code: "400",
                            status_message: "Report type not recognized"
                        });

                        socketServerConnection.write(errorResopnse);
                        console.log(`Invalid MTI/JSON received, aborting transaction`);
                    }

                    socketServerConnection.end();
                    return false;

                } catch (error) {

                    let mainLenght = Number.parseInt(hexRequest.substr(0, 4), 16);
                    let withoutMainLengthHex = hexRequest.substr(4);
                    let withoutMainLengthUtf8 = Buffer.from(hexRequest.substr(4), "hex").toString("utf8");

                    if (withoutMainLengthUtf8 < mainLenght) {
                        console.log(`Invalid MTI/JSON received, aborting transaction`);

                        socketServerConnection.end();
                        return false;
                    }

                    let isoLenght = Number.parseInt(hexRequest.substr(4, 4), 16);

                    let isoLenghtWithLenthInHex = (isoLenght * 2) + 4;

                    let isoDataHex = withoutMainLengthHex.substr(0, isoLenghtWithLenthInHex);
                    data = Buffer.from(isoDataHex, "hex");

                    let vasDataUtf8 = withoutMainLengthUtf8.substr((isoLenght + 2));

                    try {
                        extra = JSON.parse(vasDataUtf8);
                        if (process.env.APP_ENV == "local") {
                            console.log("extra", JSON.stringify(extra))
                        }
                    } catch (error) {
                        console.log(`Invalid MTI/JSON received, aborting transaction`);

                        socketServerConnection.end();
                        return false;
                    }
                }

            }

            theMTI = data.toString().substr(2, 4);

            let iso8583Parser = new cISO8583();

            //Select and call handler class
            unpackedMessage = iso8583Parser.unpack(data.toString().substring(2));
            let prrn = null;

            // if (process.env.ENABLE_ISOLOGS === 'Y') {
            //     Util.fileIsoLogger(unpackedMessage, data.toString());
            // }
            if (Util.isAndroidZenithContactlessTransactions(unpackedMessage)){
                Util.fileDataLogger(Util.getTerminalId(unpackedMessage),`Blocking Contactless on Zenith TIDS at ${new Date()}`)
                socketServerConnection.end();
                return false;
            }
            unpackedMessage = Util.modifyIsoMessage(unpackedMessage);
            if (unpackedMessage.mti == "0200") {
                prrn = unpackedMessage.dataElements[37];
                
                //set uuid rrn here
                unpackedMessage.dataElements[37] = Util.generateRandValforRRN();
                //Logging iso message for purchase
                // Util.fileIsoLogger(unpackedMessage, data.toString());
            }

            //Implement Reversal here.
            if(unpackedMessage.mti === "0420"){
                //Logging Iso Message for reversal here...
                // Util.fileIsoLogger(unpackedMessage, data.toString());
                //disable reversal for some terminal ids
                if (disabledReversals.includes(unpackedMessage.dataElements[41])) {
                    console.log("Reversal Blocked for specific tids")
                    socketServerConnection.end();
                    return false;
                }

                //Search Journal using the PRRN,
                let result = await Journal.findPreviousRRN(unpackedMessage);
                if(result){
                    //replace the rrn
                    prrn = unpackedMessage.dataElements[37];
                    unpackedMessage.dataElements[37] = result.rrn;
                }
                //Uncomment for Live
                if(result && extra && (extra["vasData"] || extra["vas4Data"]) && result.responseCode 
                    && !["99", "100", "06"].includes(result.responseCode)){
                    // check for response code for vas transaction and block if response code is valid
                    console.log("blocking reversal for response code ===>", result.responseCode)
                    return false;
                }
                if(!result && extra && (extra["vasData"] || extra["vas4Data"])){
                    // block for vas transaction not hitting the system
                    console.log("blocking reversal for vas transaction with no record ===>")
                    
                    let terminalKey = await TerminalKey.findTerminal(unpackedMessage.dataElements[41])
                    let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminalKey.sessionKey_1, terminalKey.masterKey_1, 1);
                    unpackedMessage.dataElements[39] = '25';
                    let response = ExtractKeys.rehashUnpackedIsoMessage(unpackedMessage.dataElements, iso8583Parser, clearSessionKey, '0430');
                    socketServerConnection.write(response);
                    Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), `VAS Transaction Not Found from POS ${JSON.stringify(unpackedMessage)}`);
                    socketServerConnection.end();
                    return false;
                }
                //Block Reversal for Purchase too
                if(!result){
                    //Build iso message and reply with NO card record.
                    let terminalKey = await TerminalKey.findTerminal(unpackedMessage.dataElements[41])
                    let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminalKey.sessionKey_1, terminalKey.masterKey_1, 1);
                    unpackedMessage.dataElements[39] = '25';
                    let response = ExtractKeys.rehashUnpackedIsoMessage(unpackedMessage.dataElements, iso8583Parser, clearSessionKey, '0430');
                    socketServerConnection.write(response);
                    Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), `Purchase Transaction Not Found from POS ${JSON.stringify(unpackedMessage)}`);
                    socketServerConnection.end();
                    return false;
                }
            }

            // this.unpackedMsg = unpackedMessage;

            let handlerInstance;
            let requestType = requestTypes[unpackedMessage.mti][unpackedMessage.dataElements[3].substr(0, 2)] || null;

            if (requestType !== null) {
                console.log(`Handling ${requestType.name} request`);
            } else {
                console.log(`Handling Unknown request type`);
            }

            try {
                // check if the TID is restricted

                let terminalId = Util.getTerminalId(unpackedMessage);
                if (disabledTids.find(c => c == terminalId)) {
                    socketServerConnection.end();
                    return false;
                }

                let blockNotificationReversal = RequestMiddleware.blockNotifictionReversal(unpackedMessage);
                if (blockNotificationReversal) {
                    console.error(`TID : ${terminalId} is enabled for notification hence blocked from executing reversals`);

                    socketServerConnection.end();
                    return false;
                }

            } catch (error) {
                console.error(`Error checking disabled tids ${error}`);
            }
            
            if (unpackedMessage.mti.substring(0, 2) == "08") {
                if(process.env.DEV_ENVR == "true"){
                    console.log(`Prepping from ${JSON.stringify(unpackedMessage.dataElements)}`)
                }
                let processingCode = unpackedMessage.dataElements[3].substr(0, 2);
                handlerInstance = new this.handlers.networkmessaginghandler(socketServerConnection, iso8583Parser, data, unpackedMessage);


                // do upsl prep
                if (processingCode == Util.TmkProcessingCode) {
                    let upsl = new UPSL(unpackedMessage, data, iso8583Parser);
                    upsl.prepTerminal();
                }

                let rx = Util.isKeyRequest(unpackedMessage);
                // nibss 2 preping
                if (rx) {
                    handlerInstance.handleNissFailOverKeys();
                }

                // get tams keys
                if (processingCode == Util.GParamProcessingCode && mongoose.connection.readyState == 1) {
                    let config = await BankConfigs.getConfig(Util.getTerminalId(unpackedMessage));
                    if (config) {
                        // console.log(`tams ${config.tams}`)
                        if (config.useTams) {
                            let tamsHandler = new TamsHandler(config, unpackedMessage);
                            tamsHandler.getTamsDetails();
                        }
                    }

                }

                if (processingCode == '9D') {
                    if (process.env.Allow_Callhome == 'true')
                    {
                        handlerInstance.updateTerminalState();
                    }
                    else {
                        socketServerConnection.end();
                        return false;
                    }
                }

            }

            else if (unpackedMessage.mti == "0100") {
                // console.log("MTI 0100", requestType)
                if(requestType.name === "Balance Inquiry"){
                    // let dateAndTime =  Util.formatTimestampForIsoRequest();
                    // unpackedMessage.dataElements[13] = dateAndTime.dateFormat;
                    // unpackedMessage.dataElements[12] = dateAndTime.timeFormat;
                    // unpackedMessage.dataElements[7] =  `${dateAndTime.dateFormat}${dateAndTime.timeFormat}`;
                    handlerInstance = new this.handlers.basehandler(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra, prrn);
                    // handlerInstance = new UpslRerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra);
                }else{

                    if (process.env.Allow_PreAuth === "false" || preAuthTids.includes(unpackedMessage.dataElements[41]) === false ) {
                        console.log("Ending Connection for 0100")
                        socketServerConnection.end();
                        return false;
                    }

                    handlerInstance = new this.handlers.basehandler(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra, prrn);
                }

            }
            // for requery request
            else if (unpackedMessage.mti == "0201") {
                handlerInstance = new this.handlers.requeryHandler(socketServerConnection, iso8583Parser, data, unpackedMessage);
            } else {
                console.log("getting to this block");
                Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), `Transaction Message from POS ${rawDataToLog}`);

                let isUpsl = Util.checkUpsl(unpackedMessage);
                let cardType = Util.getCardType(unpackedMessage.dataElements[2]);
                let isVerve = cardType === "VERVE";
                let isPayattitudeRequest = cardType === "PAYATTITUDE";
                let vas3checker = extra ? extra["vasData"] || null : null;
                let amount = parseInt(unpackedMessage.dataElements[4]);

                // Change is for UBA TID (For MasterCard Compliance issue)
                // unpackedMessage.dataElements[25] = Util.bankfromTID(unpackedMessage.dataElements[41], true) === 'UBA' 
                // ? '91' : unpackedMessage.dataElements[25];

                if (amount > 5000000 && enyoTids.includes(unpackedMessage.dataElements[41])) {
                    socketServerConnection.end();
                    return false;
                }

                if (Util.checkIfVirtualTidAndNoVasData(unpackedMessage, extra)
                    && process.env.Allow_VTID_NOVASDATA == "false"
                    && vas3checker !== null) {

                    Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), "Ending connection for Virtual TID not sending VAS DATA or VAS 3.0 For Withdrawals");
                    socketServerConnection.end();
                    return false;

                }

                    let blockAmount = await this.restrictPurchaseAmount(unpackedMessage, extra, prrn);
                    if(blockAmount) {
                        console.log('blocked stuff at purchase', blockAmount);
                        let terminalKey = await TerminalKey.findTerminal(unpackedMessage.dataElements[41]);
                        let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminalKey.sessionKey_1, terminalKey.masterKey_1, 1);
                        unpackedMessage.dataElements[39] = '61';
                        let response = ExtractKeys.rehashUnpackedIsoMessage(unpackedMessage.dataElements, iso8583Parser, clearSessionKey, '0210');
                        socketServerConnection.write(response);
                        // Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), `VAS Transaction Not Found from POS ${JSON.stringify(unpackedMessage)}`);
                        Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), "Ending connection for sending High Value Amount for Card Transaction - ALL CARDS");
                        socketServerConnection.end();
                        return;
                    }
                

                let directCardConfig = await directcardConfigModel.getConfig(process.env.handler, unpackedMessage);
                // console.log(directCardConfig, '<===== direct CARD config ====>');
                // For production
                //if(extra !== null && (extra["vasData"] || extra["vas4Data"]) && isUpsl) {

                if (extra !== null && (extra["vasData"] || extra["vas4Data"])
                    && isUpsl && !this.routeSterlingToNIbss(unpackedMessage)
                    && process.env.ROUTE_ALL_TO_NIBSS === "false") {

                        if(process.env.DISALLOW_WITHDRAWAL_REQUEST === "TRUE"){
                            if(extra !== null && (extra["vasData"] || extra["vas4Data"])){
                                Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), "Ending connection for sending VAS DATA for VAS Transaction - ALL CARDS");
                                socketServerConnection.end();
                                return false;
                            }
                        }
                    
                    if(process.env.ROUTE_ISW_VAS_TO_NIBSS === "true" && isVerve && process.env.CAN_DO_ISW === "true"){
                        if(process.env.BLOCK_UPSL_WITHDRAWAL_REQUEST === "TRUE"){
                            if(extra !== null && (extra["vasData"] || extra["vas4Data"])){
                                Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), "Ending connection for sending VAS DATA for VAS Transaction - VERVE CARDS");
                                socketServerConnection.end();
                                return false;
                            }
                        }
                        unpackedMessage.dataElements[3] = `00${unpackedMessage.dataElements[3].substring(2, 6)}`;
                        // unpackedMessage.dataElements[53] = null;
                        unpackedMessage.dataElements[60] = null;
                        unpackedMessage.dataElements[62] = null;
                    
                        handlerInstance = new this.handlers.basehandler(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra, prrn);
                    }
                    else if (process.env.CAN_DO_ISW === "true" && isVerve && process.ROUTE_ISW_VAS_TO_NIBSS === "false") {

                        handlerInstance = new InterSwitch_Rerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra);

                    } else if (!isVerve) {
                        switch (cardType) {
                            case "MASTERCARD":
                                if(process.env.BLOCK_UPSL_WITHDRAWAL_REQUEST === "TRUE"){
                                    if(extra !== null && (extra["vasData"] || extra["vas4Data"])){
                                        Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), "Ending connection for sending VAS DATA for VAS Transaction MASTERCARD");
                                        socketServerConnection.end();
                                        return false;
                                    }
                                }
                                process.env.ROUTE_MASTERCARD === "UPSL" ?
                                handlerInstance = process.env.USE_NEW_UPSL === 'true' ? new UpslRerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra) 
                                : new UPSL_Direct(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra) :
                                handlerInstance = new InterSwitch_Rerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra)
                                break;
                            case "VISA":
                                if(process.env.BLOCK_UPSL_WITHDRAWAL_REQUEST === "TRUE"){
                                    if(extra !== null && (extra["vasData"] || extra["vas4Data"])){
                                        Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage), "Ending connection for sending VAS DATA for VAS Transaction - VISA CARDS");
                                        socketServerConnection.end();
                                        return false;
                                    }
                                }
                                process.env.ROUTE_VISA === "UPSL" ?
                                handlerInstance = process.env.USE_NEW_UPSL === 'true' ? new UpslRerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra) 
                                : new UPSL_Direct(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra) :
                                handlerInstance = new InterSwitch_Rerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra)
                                break;
                        }
                    }

                } else if (isPayattitudeRequest) {
                    // if(isPayattitudeRequest && extra !== null && (extra["vasData"] || extra["vas4Data"])){
                    //     handlerInstance = new UpslRerouter(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra);
                    // }else{
                        //This was used.
                        // unpackedMessage.dataElements[32] = "11129";
                        handlerInstance = new UPSL_Direct(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra);
                    // }
                }
                else if(directCardConfig && !isVerve && unpackedMessage.dataElements[3].substring(0, 2) !== "01" && !extra ){
                    //Bills Payment & Purchase
                    // if(unpackedMessage.dataElements[3].substring(0, 2) === "20"){
                    //     unpackedMessage.dataElements[3].substring(0, 2) = "00";
                    // }
                    handlerInstance = new AccessRerouter(socketServerConnection, iso8583Parser, prrn, unpackedMessage, extra, rawDataToLog);
                }
                else {
                    //Bills Payment & Purchase
                    if (unpackedMessage.dataElements[3].substring(0, 2) !== "01") {
                        unpackedMessage.dataElements[3] = `00${unpackedMessage.dataElements[3].substring(2, 6)}`;
                    }
                    // unpackedMessage.dataElements[53] = null;
                        unpackedMessage.dataElements[60] = null;
                        unpackedMessage.dataElements[62] = null;
                        // console.log('fired Up', 'Are we here????');
                        
                        handlerInstance = new this.handlers.basehandler(socketServerConnection, iso8583Parser, data, unpackedMessage, true, extra, prrn);                
                }

            }

            handlerInstance.process();

        });

        socketServerConnection.on('error', err => {

            if (unpackedMessage != null){
                console.error(`Server socket error : ${err.toString()} >> terminal: ${Util.getTerminalId(unpackedMessage)} rrn: ${Util.getRRN(unpackedMessage)} mti: ${unpackedMessage.mti}  at ${requestTime} - ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalId(unpackedMessage), `Server Socket Error ${err.toString()} and Raw Data received ${rawData}`);
            }
            else {
                console.error(`Server socket error : ${err.toString()}`);
                console.error(`Raw data : ${rawData}`);
            }

        });

    }

    routeSterlingToNIbss(unpackedMessage){
        try{
            let isSTERLINGPOS = Util.bankfromTID(unpackedMessage.dataElements[41], true) === 'STERLING';
            let amount = parseInt(unpackedMessage.dataElements[4])
            if(!isSTERLINGPOS) return false
            //check if amount is less than 20k and route
            return amount <= 2000000 ? true : false
        }catch(err){
            console.error("Unable to determine sterling route to nibss", err)
            return false
        }
    }

    async restrictPurchaseAmount(unpackedMessage, extra=null, prrn){
        try{
            let amount = parseInt(unpackedMessage.dataElements[4]);
            let exceptionsArr = process.env.EXEMPTED_MIDS ? process.env.EXEMPTED_MIDS.split(",") : [];
            // console.log(exceptionsArr, 'Array mids exempted');
            let isExempted = exceptionsArr.includes(unpackedMessage.dataElements[42])
            if(!isExempted && amount <= 200000000) return false;
            if(amount <= 500000000) return false;
            //Notify my email.

            let initialSaveUpdate = await this.saveHighTxnValue(unpackedMessage, extra, prrn);

            if (initialSaveUpdate === false) {
                console.error(`There was an error updating the initially saved transaction, aborting`);
                Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),`There was an error updating the initially saved transaction, aborting`);
                return false;
                // if(theSocketClientInstance) theSocketClientInstance.end();
            }
            return initialSaveUpdate;
        }catch(e) {
            console.error('Disable too large Amount', e.message);
            return false;
        }
    }

    async saveHighTxnValue(unpackedMessage, extra = null, prrn) {
        let vasData = extra ? extra["vasData"] || null : null;
        let vas4Data = extra ? extra["vas4Data"] || null : null;

        let saveDetails = {
            rrn: unpackedMessage.dataElements[37],
            prrn: prrn,
            onlinePin: (unpackedMessage.dataElements[52] !== null ? true : false),
            merchantName: unpackedMessage.dataElements[43].substring(0, 22),
            merchantAddress: unpackedMessage.dataElements[43].substring(23),
            merchantId: unpackedMessage.dataElements[42],
            terminalId: unpackedMessage.dataElements[41],
            STAN: unpackedMessage.dataElements[11],
            // transactionTime: new Date(),
            posDateTime: unpackedMessage.dataElements[7],
            handlerResponseTime: new Date(),
            responseCode: '61',
            merchantCategoryCode: unpackedMessage.dataElements[18],
            handlerName: "NIBSS " + process.env.handler,
            MTI: unpackedMessage.mti,
            maskedPan: unpackedMessage.dataElements[2].substr(0, 6) + ''.padEnd(unpackedMessage.dataElements[2].length - 10, 'X') + unpackedMessage.dataElements[2].slice(-4),
            processingCode: unpackedMessage.dataElements[3],
            amount: parseInt(unpackedMessage.dataElements[4]),
            currencyCode: unpackedMessage.dataElements[49] || '566',
            messageReason: Util.getNibssResponseMessageFromCode("61") || 'Exceeds withdrawal limit',
            originalDataElements: unpackedMessage.dataElements[90] || "",
            customerRef: unpackedMessage.dataElements[59] || "",
            script: unpackedMessage.dataElements[55] || "",
            cardExpiry: unpackedMessage.dataElements[14] || "",
            transactionType: vasData !== null || vas4Data !== null ? 'VAS' : 'Purchase',
            isVasComplete: false,
            vasData: vas4Data !== null ? vas4Data : vasData !== null ? vasData : null,
            handlerUsed: process.env.handler,
        }

        if (Util.isMitType(unpackedMessage, '02') && Util.getICCData(unpackedMessage) !== false) {
            let iccData = Util.getICCData(unpackedMessage);
            saveDetails.TVR = iccData.get('95');
            saveDetails.CRIM = iccData.get('9F26');
        }

        // extracting e-journal details and saving to db for transaction
        // let customData = saveDetails.customerRef.split('~');
        // if(customData.length < 1)

        // customData = Util.extractEjournalDatafromTLV(customData[customData.length - 1]);

        // if (customData !== {} && customData.aid !== undefined) {
        //     saveDetails.ejournalData = customData;
        // }

        let transactionDetails = {
            ...saveDetails
        };

        // Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),JSON.stringify(transactionDetails));

        // transaction data before process
        let handlingModelInstance = new restrictedJournal(saveDetails);

        let saved = false;

        await handlingModelInstance.save().then(() => {

                console.log(`Saved Transaction from Terminal: ${transactionDetails.terminalId}, with RRN: ${transactionDetails.rrn}`);
                // Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),`Saved Transaction from Terminal: ${transactionDetails.terminalId}, with RRN: ${transactionDetails.rrn}`);

                saved = true;

            })
            .catch((error) => {
                console.error(`Exception Saving ${transactionDetails.terminalId}, with RRN: ${transactionDetails.rrn}, Exception ${error}`);
                Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),`Exception Saving ${transactionDetails.terminalId}, with RRN: ${transactionDetails.rrn}, Exception ${JSON.stringify(error)}`);
                // Util.failedDbLogs(`Exception Saving ${transactionDetails.terminalId}, with RRN: ${transactionDetails.rrn}, Exception ${error}`);
                // EmailNotifier.sendCriticalErrorAlert(`Exception Saving ${transactionDetails.terminalId}, with RRN: ${transactionDetails.rrn}, Exception ${error}`);
            });
        return saved;
    }

}

module.exports = SocketServerHandler;
// 1561748400000
