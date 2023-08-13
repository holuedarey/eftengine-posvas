/**
 * @author Abolaji
 * @author Adeyemi Sola
 * Interswitch controller
 */
require('dotenv').config();
const baseMessage = require('../ciso8583/engine/dataelements.json');
const baseSubFieldMessage = require('../ciso8583/engine/subField-data-elements.json');
const CISO = require('../ciso8583/CISO');
const Util = require('../helpers/Util');
const config = require('../ciso8583/engine/interswitch-dataelement-config.json');
const ClientSocket = require('../socket/socketclient');
const InterswitchConfig = require('../model/interswitchConfigModel');
const CronJob = require('cron').CronJob;
const ExtractKeys = require('../helpers/ExtractKeys');
const Journal = require('../model/journalmodel');

class interswitchHander {

    constructor() {
        this.interswitchIP = process.env.INTERSWITCH_HOST;
        this.interswitchPort = process.env.INTERSWITCH_POST;

        this.ciso = new CISO(config);
        this.testBDK = "B8916AA68FE2C22A4E5DD5E033D8549B";

        this.ZMK = Util.xorHexString(process.env.INTERSWITCH_COM1_TEST, process.env.INTERSWITCH_COM2_TEST);
        this.ETPK = process.env.INTERSWITCH_KWP;
        // this.clearTPK = Util.decrypt3DES(this.ETPK,"hex",this.ZMK,"hex","hex");
        this.interSwitchFailoverIp = process.env.INTERSWITCH_FALOVER_HOST;
        this.intersSwitchFailoverPort = process.env.INTERSWITCH_FAILOVER_PORT;

        this.socketClient = null;
    }

    async signOnRequest(start = false) {
        let self = this;

        let dataElements = baseMessage;
        let transactionDateTime = Util.getTransmissionDateandTime();
        dataElements['7'] = transactionDateTime;
        let datetime = (new Date).getTime().toString();
        dataElements['11'] = datetime.substr(datetime.length - 6);
        dataElements['12'] = transactionDateTime.substr(4);
        dataElements['13'] = transactionDateTime.substr(0, 4);
        dataElements['70'] = '001';

        let packedIso = this.ciso.packWithBinaryBitmap('0800', dataElements);
        let isoMessage = packedIso.isoMessageBytes;
        let isoLength = isoMessage.toString('hex').length / 2;

        let binLength = Util.getLengthBytes(isoLength);

        let isoMessageBytes = packedIso.isoMessageBytes;
        let requestData = Buffer.concat([binLength, isoMessageBytes]);

        console.log(requestData.toString());


        console.log(`Processing Interswitch Sign-on request`);

        
        let socketclient = new ClientSocket(this.interswitchIP, this.interswitchPort);

        console.log("Request Data", JSON.stringify(requestData));

        return new Promise((resolve, reject) => {

            console.log("Request Data In Promise ", JSON.stringify(requestData));

            let socketHandler = socketclient.startClient(requestData);

            console.log("Its currently here at the moment about to send for sign on")

            socketHandler.on('data', async (data) => {

               console.log(`Interswitch Sign-on was successful at ${new Date()}`);
               // socketHandler.end();
               await this.pinKeyRequest();

               new CronJob(process.env.Interswitch_Echo_Cron, function () {
                   self.echoDataRequest().then();
               }, null, true, 'Africa/Lagos', null, true);

               
           });

           socketHandler.on('error', err => {
               console.error(`Interswitch Sign-on failed at ${new Date()}`);
               reject(err);
           });

        });

 

    }

    async failOversignOnRequest(isFailOver = false) {
        let self = this;

        let dataElements = baseMessage;
        let transactionDateTime = Util.getTransmissionDateandTime();
        dataElements['7'] = transactionDateTime;
        let datetime = (new Date).getTime().toString();
        dataElements['11'] = datetime.substr(datetime.length - 6);
        dataElements['12'] = transactionDateTime.substr(4);
        dataElements['13'] = transactionDateTime.substr(0, 4);
        dataElements['70'] = '001';

        let packedIso = this.ciso.packWithBinaryBitmap('0800', dataElements);
        let isoMessage = packedIso.isoMessageBytes;
        let isoLength = isoMessage.toString('hex').length / 2;

        let binLength = Util.getLengthBytes(isoLength);

        let isoMessageBytes = packedIso.isoMessageBytes;
        let requestData = Buffer.concat([binLength, isoMessageBytes]);

        console.log(dataElements, 'sign on RAW Message');

        console.log(`Processing Interswitch Sign-on request`);

        let socketclient = await this.setUpClientSocket('failoverSignon', isFailOver);

        if(!socketclient) return;

        console.log("Request Data", JSON.stringify(requestData));

        return new Promise((resolve, reject) => {
            // console.log("Request Data In Promise ", JSON.stringify(requestData));
            let failOverSocketHandler = socketclient.startClient(requestData);
            console.log("Its currently here at the moment about to send for failover sign on")
            failOverSocketHandler.on('data', async (data) => {
               console.log(`Interswitch Failover Sign-on was successful at ${new Date()}`);
               console.log('SIGN On Response', data.toString())
               resolve(data);
               failOverSocketHandler.end();

            //Dont end socket
           });
            failOverSocketHandler.on('error', err => {
                console.error(`Interswitch Sign-on failed at ${new Date()}`);
                reject(err);
            });

            failOverSocketHandler.on('timeout', err => {
                console.error(`Interswitch Sign-on timed out at ${new Date()}`);
                reject(err);
            });

            failOverSocketHandler.on('close', err => {
                console.error(`Interswitch Sign-on closed out at ${new Date()}`);
                reject(err);
            });

        });

    }

    async failOverPollingMessage(isFailOver = false) {
        let self = this;

        let dataElements = baseMessage;
        let transactionDateTime = Util.getTransmissionDateandTime();
        dataElements['7'] = transactionDateTime;
        let datetime = (new Date).getTime().toString();
        dataElements['11'] = datetime.substr(datetime.length - 6);
        dataElements['12'] = transactionDateTime.substr(4);
        dataElements['13'] = transactionDateTime.substr(0, 4);
        dataElements['70'] = '301';

        let packedIso = this.ciso.packWithBinaryBitmap('0800', dataElements);
        let isoMessage = packedIso.isoMessageBytes;
        let isoLength = isoMessage.toString('hex').length / 2;

        let binLength = Util.getLengthBytes(isoLength);

        let isoMessageBytes = packedIso.isoMessageBytes;
        let requestData = Buffer.concat([binLength, isoMessageBytes]);

        // console.log(dataElements, 'Polling message RAW');

        console.log(`Processing Interswitch Sign-on request`);

        let socketclient = await this.setUpClientSocket('failoverSignon', isFailOver);

        if(!socketclient) return;

        // console.log("Request Data", JSON.stringify(requestData));

        return new Promise((resolve, reject) => {

            // console.log("Request Data In Promise ", JSON.stringify(requestData));

            let failOverPollingMsgSocketHandler = socketclient.startClient(requestData);
            // console.log("Its currently here at the moment about to send for failover polling msg")
            failOverPollingMsgSocketHandler.on('data', async (data) => {
               console.log(`Interswitch Failover Polling was successful at ${new Date()}`);
            //    console.log('Polling Msg Response', data.toString())
               resolve(data);
               failOverPollingMsgSocketHandler.end();
           });
            failOverPollingMsgSocketHandler.on('error', err => {
                console.error(`Interswitch Polling message failed at ${new Date()}`);
                reject(err);
            });

            failOverPollingMsgSocketHandler.on('timeout', () => {
                console.error(`Interswitch Polling message timed out at ${new Date()}`);
                reject(false);
            });

            failOverPollingMsgSocketHandler.on('close', () => {
                console.error(`Interswitch Polling message closed out at ${new Date()}`);
                reject(false);
            });

        });

    }

    async setUpClientSocket(reqname="", isFailOver=false) {
        
        let socketclient = null;
        // console.log('isFailover COndition for setup', isFailOver);
        if(isFailOver){
            socketclient = new ClientSocket(this.interSwitchFailoverIp, this.intersSwitchFailoverPort);
        }else{
            socketclient = new ClientSocket(this.interswitchIP, this.interswitchPort);
        }
        return socketclient
    }


    async prepRequest(reqname="") {
        let socketclient = new ClientSocket(this.interswitchIP, this.interswitchPort);
        // let socketHandler = socketclient.startClient(requestData);
        return socketclient
    }

    async pinKeyRequest() {

        let dataElements = baseMessage;
        let transactionDateTime = Util.getTransmissionDateandTime();
        dataElements['7'] = transactionDateTime;
        let datetime = (new Date).getTime().toString();
        dataElements['11'] = datetime.substr(datetime.length - 6);
        dataElements['12'] = transactionDateTime.substr(4);
        dataElements['13'] = transactionDateTime.substr(0, 4);
        dataElements['70'] = '101';
        console.log("pinkey request",JSON.stringify(dataElements))

        let packedIso = this.ciso.packWithBinaryBitmap('0800', dataElements);
        let isoMessage = packedIso.isoMessage;
        let isoLength = isoMessage.length;

        let binLength = Util.getLengthBytes(isoLength);

        let isoMessageBytes = packedIso.isoMessageBytes;
        let requestData = Buffer.concat([binLength, isoMessageBytes]);

        console.log(requestData.toString());

        console.log(`Processing Interswitch Key Exchange(Pin Key) request`);

        let socketclient = await this.prepRequest("pin key");
        if(!socketclient)return;

        let socketHandler = socketclient.startClient(requestData);
        socketHandler.on('data', data => {
            console.log(`Interswitch Key Exchange was successful at ${new Date()}`);
            let message = Buffer.from(data).toString('hex')
            let response = this.ciso.unpackWithBinaryBitmap(message);
            Util.fileDataLogger("ISW-KEY-EXCHANGE", "pinkey response " + JSON.stringify(response));
            let pinData = response.dataElements['53'];

            if (pinData) {
                let config = {
                    pinKey: pinData.substr(0, 32),
                    keyCheck: pinData.substr(32, 6),
                    sequence: 0
                };

                InterswitchConfig.UpdatePinkey(config);
            }

            socketHandler.end();
        });
    }

    async echoDataRequest() {

        let dataElements = baseMessage;
        let transactionDateTime = Util.getTransmissionDateandTime();
        dataElements['7'] = transactionDateTime;
        let datetime = (new Date).getTime().toString();
        dataElements['11'] = datetime.substr(datetime.length - 6);
        dataElements['12'] = transactionDateTime.substr(4);
        dataElements['13'] = transactionDateTime.substr(0, 4);
        dataElements['70'] = '301';

        let packedIso = this.ciso.packWithBinaryBitmap('0800', dataElements);
        let isoMessage = packedIso.isoMessage;
        let isoLength = isoMessage.length;


        let binLength = Util.getLengthBytes(isoLength);


        // console.log(`binlength: ${binLength.toString('hex')}`);

        let isoMessageBytes = packedIso.isoMessageBytes;
        let requestData = Buffer.concat([binLength, isoMessageBytes]);

        console.log(requestData.toString());


        console.log(`Sending Interswitch ECHO Data at ${(new Date()).toString()}`);
        let socketclient = await this.prepRequest();
        if(!socketclient)return;

        let socketHandler = socketclient.startClient(requestData);
        socketHandler.on('data', data => {

            let message = Buffer.from(data).toString('hex')
            let response = this.ciso.unpackWithBinaryBitmap(message);
            console.log(`Interswitch ECHO Data Response ${response.dataElements[39]} at ${(new Date()).toString()}`);
            socketHandler.end();
        });

    }

    /**
     * 
     * @param {*} isFailover 
     * @returns {Promise}
     */
    async failoverKeyExchangeRequest(isFailover = false){
        let dataElements = baseMessage;
        let transactionDateTime = Util.getTransmissionDateandTime();
        dataElements['7'] = transactionDateTime;
        let datetime = (new Date).getTime().toString();
        dataElements['11'] = datetime.substr(datetime.length - 6);
        dataElements['12'] = transactionDateTime.substr(4);
        dataElements['13'] = transactionDateTime.substr(0, 4);
        // dataElements['52'] = Util.xorISWComponentKey(1).toString('hex');
        dataElements['70'] = '101';

        let packedIso = this.ciso.packWithBinaryBitmap('0800', dataElements);
        let isoMessage = packedIso.isoMessage;
        let isoLength = isoMessage.length;

        let binLength = Util.getLengthBytes(isoLength);

        // console.log(`binlength: ${binLength.toString('hex')}`);

        let isoMessageBytes = packedIso.isoMessageBytes;
        let requestData = Buffer.concat([binLength, isoMessageBytes]);

        // console.log(requestData.toString(), 'REQUEST at key exchange in buffer');

        console.log(`Sending Interswitch ECHO Data at ${(new Date()).toString()}`);
        //Previous query.
        // let iswKey = await Util.getIswKeys(Util.handlers.interswitchFailover);
        // let today = new Date();
        // console.log('TODAYS date', today, '\n', 'Date on Database', iswKey.updatedAt);
        // if(today <= iswKey.updatedAt){
        //     return
        // }
        let socketClient = await this.setUpClientSocket('Key exchange', isFailover);
        if(!socketClient) return;

        let echoSocketHandler = socketClient.startClient(requestData);
        
        let self = this;
        return new Promise(
            function (resolve, reject) {
                echoSocketHandler.on('data', async(data) => {

                    let message = Buffer.from(data).toString('hex');
                    let response = self.ciso.unpackWithBinaryBitmap(message);
                    // console.log(`ISW ECHO Data BIGGER Response ${JSON.stringify(response.dataElements)} ON DATE at ${(new Date()).toString()}`);
                    console.log(`Interswitch Key Exchange Response ${response.dataElements[39]} at ${(new Date()).toString()}`);
                    // let responseData = self.mapInterswitchToNibssResponse(response);
                    
                    
                    let saved = await Util.saveIswPinKey(Util.handlers.interswitchFailover, response);
                    if(!saved) reject(false);
                    let responseData = {};
                    responseData.interSwitchResponse = response.dataElements[39];
                    responseData.resCode = response.dataElements[39] == '09' ? '00' : response.dataElements[39];
                    responseData.authCode = response.dataElements[38] || '';
                    responseData.iccResponse = null;

                    // console.log(responseData, 'mapped Response to NIBSS - POS');
                    //Resolving as though not a response from NI
                    resolve(responseData);
                    echoSocketHandler.end();
                });

                echoSocketHandler.on('error', err => {
                    console.log('eRROR from sending KEY EXCHANGE to ISW', err);
                    reject(err);
                });

                echoSocketHandler.on('close', () => {
                    console.log('Closed Client at KEY EXCHANGE ISW');
                    reject(false);
                });

                echoSocketHandler.on('timeout', () => {
                    console.log('Client Timedout at KEY EXCHANGE ISW');
                    reject(false);
                });

                echoSocketHandler.on('end', () => {
                    console.log('Client socket ENDED at KEY EXCHANGE ISW');
                    reject(false);
                });

            }
        )

    }

    /**
     * map nibss request to interswitch message
     * @param {Object} unpackedMessage unpacked request from POS
     * @param {Object} terminal terminal object with nibbss and tams keys.
     * @returns {Promise<Object>} return promise of rescode, authCode and iccResponse
     */
    async sendOfflineTransaction(unpackedMessage) {
        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);
        let subFieldMessage = baseSubFieldMessage;

        // For CashOut Interswitch
        requestData['41'] = `2ITEX${requestData['41'].substring(5, 8)}`

        requestData['3'] = `50${requestData['3'].substring(2,6)}`;;


        // For Cashout End
       
        // requestData['30'] = unpackedMessage.dataElements['28'];
        requestData['33'] = "111111";
        requestData['53'] = null;

        requestData['55'] = null;
        requestData['56'] = "1510";
        requestData['59'] = unpackedMessage.dataElements['37'];
        requestData['60'] =  null;
        // requestData['28'] = null;

        requestData['98'] = process.env.ISW_PROCESSORID;

        requestData['100'] = process.env.ISW_BANK_RID;


        // Account to be settled (After the settlement fee is deducted)
        //requestData['102'] = process.env.ISW_SETTLEMENT_ACCOUNT;
        requestData['103'] = process.env.ISW_SETTLEMENT_ACCOUNT;

        requestData['128'] = null;

        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";
        let mainIso = this.ciso.packWithBinaryBitmap(unpackedMessage.mti, requestData);

        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');

        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));

        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        if (!xmlICC)
            return false;

        subFieldMessage['25'] = xmlICC;

        // For cashout ISW
        subFieldMessage['33'] = "6008";

        subFieldMessage["2"] = "1673903725299400";
        subFieldMessage["3"] = "                        000936000936            ";
        subFieldMessage["13"] = "     000000   566";


        

        console.log("Request data \n", JSON.stringify(requestData), "\n");
        console.log("subFieldMessage 127 \n", JSON.stringify(subFieldMessage), "\n"); 



        // For cashout ISW End

        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);

        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');

        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);

        let requestMsg = Buffer.concat([binLength, bufferMsg]);

        console.log(`Sending transaction through INTERSWITCH at ${(new Date().toString())}`);
        let socketclient = await this.prepRequest("offline purchase");
        //if(!socketclient)return false;

        let socketHandler = socketclient.startClient(requestMsg);
        let self = this;
        return new Promise(
            function (resolve, reject) {

                socketHandler.on('data', data => {
                    console.log('purchase response: ' + Buffer.from(data).toString('hex'));
                    let message = Buffer.from(data).toString('hex')
                    let response = self.ciso.unpackWithBinaryBitmap(message);
                    console.log(JSON.stringify(response));
                    // console.log(JSON.stringify(unpackedSubfield))
                    socketHandler.end();
                    let responseData = self.mapInterswitchToNibssResponse(response);
                    resolve(responseData);
                });

                socketHandler.on('error', err => {
                    reject(err);
                });
            }

        );

    }

    /**
     * map nibss request to interswitch message for failover
     * @param {Object} unpackedMessage unpacked request from POS
     * @param {Object} terminal terminal object with nibbss and tams keys.
     * @returns {Promise<Object>} return promise of rescode, authCode and iccResponse
     */
     async sendOfflineFailoverTransaction(unpackMessageFromNibss, isFailoverRequest=false) {
        try{
            let requestData = {};
            // let unpackMessageFromNibss = this.ciso.unpack(isoMessage.toString().substring(2));
            // if(!unpackMessageFromNibss) return false;
            if(!unpackMessageFromNibss) return false;
            // Object.assign(requestData, unpackMessageFromNibss.dataElements);
            Object.assign(requestData, unpackMessageFromNibss.dataElements);
            let subFieldMessage = baseSubFieldMessage;

            requestData['56'] = "1510";

            requestData['128'] = null;
            // // set dummy data to avoid binary character encode ish of d127 bitmap
            requestData['127'] = "1";
            let mainIso = this.ciso.packWithBinaryBitmap(unpackMessageFromNibss.mti, requestData);
            let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');
            // // remove the dummy D127 and it's length
            hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));
            let xmlICC = Util.mapICCDataToXML(unpackMessageFromNibss);
            // console.log(xmlICC, 'XML Data, ???');
            if (!xmlICC)
                return false;
            subFieldMessage['25'] = xmlICC;
            subFieldMessage["2"] = "1673903725299400";
            subFieldMessage["3"] = "                        000936000936            ";
            subFieldMessage["13"] = "     000000   566";

            // console.log("Request data \n", JSON.stringify(requestData), "\n");
            // console.log("subFieldMessage 127 \n", JSON.stringify(subFieldMessage), "\n"); 

            let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);
            let subIsoHex = subIso.isoMessageBytes.toString('hex');
            let subFieldLength = subIsoHex.length / 2;
            let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
            let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

            // // append 127 in hex to main iso message
            hexIsoMessage += paddedLengthHex;
            hexIsoMessage += subIsoHex;
            let bufferMsg = Buffer.from(hexIsoMessage, 'hex');
            let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);
            let requestMsg = Buffer.concat([binLength, bufferMsg]);
            // console.log(`Sending Purchase transaction through INTERSWITCH at ${(new Date().toString())}`);
            Util.fileDataLogger(Util.getTerminalId(unpackMessageFromNibss),`Sending OFFLINE ${requestMsg.toString()} transaction through INTERSWITCH at ${(new Date().toString())}`);
            let socketclient = await this.setUpClientSocket("offline purchase", isFailoverRequest);
            if(!socketclient)return false;

            let socketHandler = socketclient.startClient(requestMsg);
            let self = this;
            return new Promise( (resolve, reject) => {

                socketHandler.on('data', data => {
                    // console.log('purchase response: ' + Buffer.from(data).toString('hex'));
                    let message = Buffer.from(data).toString('hex');
                    let response = self.ciso.unpackWithBinaryBitmap(message);
                    // console.log(JSON.stringify(response), 'labelled response Binary');
                    let responseData = self.mapInterswitchToNibssResponse(response);
                    // console.log(responseData, 'mapped Response to NIBSS - POS');
                    //Resolving as though not a response from NI
                    if(!responseData) reject(false);
                    resolve(responseData);
                    Util.fileDataLogger(Util.getTerminalId(unpackMessageFromNibss),`ISW Response:: ${JSON.stringify(responseData)} at OFFLINE failover: ${JSON.stringify(response)}`);
                    socketHandler.end();
                });

                socketHandler.on('error', err => {
                    console.error('eRROR from sending to ISW', err);
                    Util.fileDataLogger(Util.getTerminalId(unpackMessageFromNibss), `ISW Socket Client Error occured on ${JSON.stringify(err)}`);
                    reject(err);
                });

                socketHandler.on('close', () => {
                    console.warn('Closed Client at ISW offline');
                    Util.fileDataLogger(Util.getTerminalId(unpackMessageFromNibss), `ISW Socket Client Closed at ${(new Date().toString())}`);
                    let responseData = {};
                        responseData.interSwitchResponse = "99";
                        responseData.resCode = "99";
                        responseData.authCode = unpackMessageFromNibss ? unpackMessageFromNibss.dataElements[38] || '' : '';
                        // let unpackedSubfield = unpackMessageFromNibss ? this.ciso.unpackSubfieldWithBinaryBitmap(unpackMessageFromNibss.dataElements['127'], config['127'].nestedElements) : "";
                        responseData.iccResponse = null;
                    return responseData ? responseData : reject(false);
                });

                socketHandler.on('timeout', () => {
                    console.warn('Client Timedout at ISW offline');
                    Util.fileDataLogger(Util.getTerminalId(unpackMessageFromNibss), `ISW Socket Timedout at ${(new Date().toString())}`);
                    let responseData = {};
                        responseData.interSwitchResponse = "99";
                        responseData.resCode = "99";
                        responseData.authCode = unpackMessageFromNibss ? unpackMessageFromNibss.dataElements[38] || '' : '';
                        // let unpackedSubfield = unpackMessageFromNibss ? this.ciso.unpackSubfieldWithBinaryBitmap(unpackMessageFromNibss.dataElements['127'], config['127'].nestedElements) : "";
                        responseData.iccResponse = null;
                        return responseData ? responseData : reject(false);
                });
            }

        );
        }catch(err){
            console.error('Error occured here', err.message);
            return false;
        }

    }

    /**
     * map nibss request to interswitch message
     * @param {Object} unpackedMessage unpacked request from POS
     * @param {Object} terminal terminal object with nibbss and tams keys.
     * @returns {Promise<Object>} return promise of rescode, authCode and iccResponse
     */
    async sendOnlineTransaction(unpackedMessage, terminal, mw_handler = null) {

        let interConfig = await InterswitchConfig.getConfig();

        console.log("interConfig => ", interConfig);
        if (!interConfig)
            return false;

        let oldPinblock = unpackedMessage.dataElements['52'];
        console.log(`old pinblock ${oldPinblock}`);

        // ExtractKey.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1,keysVersion)

        // if(terminal.isVirtualTid) {
        //     terminal.masterKey_1 = ExtractKeys.getDecryptedMasterKey(terminal.masterKey_1, "virtualtid");
        // }

        // let mw_instance = 1;

        // if(mw_handler !== null) {

        //     mw_instance = mw_handler === 'POSVAS' ? 1 : 2;
        // }


        const env = terminal.isVirtualTid ? "virtualtid" : 1;

        let terminalId = requestData['41'];

        // 100 to denote virtualTid
        let pinblock = this.getDesPinblock(terminal, oldPinblock, interConfig.pinKey, env);
        // console.log(`block binary : ${pinblock}`);
        let dummyPinblock = pinblock.substr(0, 8);
        let dummyPinblockHex = Buffer.from(dummyPinblock, 'utf8').toString('hex').toLowerCase();

        // console.log(`dumgvmy pin ${dummyPinblock}`);
        // console.log(`dummy pin hex ${dummyPinblockHex}`);



        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);
        let subFieldMessage = baseSubFieldMessage;


        requestData['52'] = dummyPinblock;
        // requestData['52'] = null;
        //requestData['52'] = "dummyPinblock";

        // For CashOut Interswitch
        requestData['41'] = `2ITEX${requestData['41'].substring(5, 8)}`

        requestData['3'] = `50${requestData['3'].substring(2,6)}`;


        // For Cashout End
        // requestData['23'] = null;
        requestData['28'] = `C${requestData['28'].substr(1)}`;

        // requestData['30'] = unpackedMessage.dataElements['28'];

        requestData['33'] = "111111";

        requestData['53'] = null;

        requestData['55'] = null;
        requestData['56'] = "1510";
        requestData['59'] = unpackedMessage.dataElements['37'];
        requestData['60'] =  null;

        //requestData['59'] =  null;
        // requestData['28'] = null;

        requestData['98'] = process.env.ISW_PROCESSORID;

        requestData['100'] = process.env.ISW_BANK_RID;


        // Account to be settled (After the settlement fee is deducted)
        requestData['102'] = null;
        requestData['103'] = process.env.ISW_SETTLEMENT_ACCOUNT;

        requestData['128'] = null;


        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";
        let mainIso = this.ciso.packWithBinaryBitmap(unpackedMessage.mti, requestData);

        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');

        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));

        // replace the dummy pinblock with the orginal pinblock( to avoid character encodiing ish)
        hexIsoMessage = hexIsoMessage.replace(dummyPinblockHex, pinblock.toLowerCase());

        // console.log(`after pinblock replace ${hexIsoMessage}`);

        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        if (!xmlICC)
            return false;

        subFieldMessage['25'] = xmlICC;
        subFieldMessage['33'] = '6008';

        subFieldMessage["2"] = "1673903725299400";
        subFieldMessage["3"] = "                        000936000936            ";
        subFieldMessage["13"] = "     000000   566";
        

        Util.fileDataLogger(terminalId,"Request data \n" + JSON.stringify(requestData)+ "\n");
        Util.fileDataLogger(terminalId,"subFieldMessage 127 \n"+  JSON.stringify(subFieldMessage)+ "\n");



        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);

        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');

        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);

        let requestMsg = Buffer.concat([binLength, bufferMsg]);
        Util.fileDataLogger(terminalId, requestMsg.toString("hex"));
        Util.fileDataLogger(terminalId,requestMsg.toString());

        Util.fileDataLogger(terminalId,`Sending transaction through INTERSWITCH at ${(new Date().toString())}`);
        let socketclient = await this.prepRequest("online purchase");
        if(!socketclient) return false;

        let socketHandler = socketclient.startClient(requestMsg);
        let self = this;
        return new Promise(
            function (resolve, reject) {

                socketHandler.on('data', data => {
                    Util.fileDataLogger(terminalId,'purchase response: ' + Buffer.from(data).toString('hex'));
                    let message = Buffer.from(data).toString('hex')
                    let response = self.ciso.unpackWithBinaryBitmap(message);
                    Util.fileDataLogger(terminalId,JSON.stringify(response));
                    // console.log(JSON.stringify(unpackedSubfield))
                    socketHandler.end();
                    let responseData = self.mapInterswitchToNibssResponse(response);
                    resolve(responseData);
                });

                socketHandler.on('error', err => {
                    reject(err);
                });
            }

        );

    }

    /**
     * map nibss request to interswitch message
     * @param {Object} unpackedMessage unpacked request from POS
     * @param {Object} terminal terminal object with nibbss and tams keys.
     * @returns {Promise<Object>} return promise of rescode, authCode and iccResponse
     */
     async sendOnlineFailOverTransaction(unpackedMessage, terminal, mw_handler = null, isFailoverRequest=false) {
        let requestData = {};

        let oldPinblock = unpackedMessage.dataElements['52'];
        let mw_instance = 1;
        if(mw_handler !== null) {
            mw_instance = mw_handler === 'POSVAS' ? 1 : 2;
        }
        const env = terminal.isVirtualTid ? "virtualtid" : 1;
        // console.log(terminal.isVirtualTid, 'is it a vTID?????');

        // if(terminal.isVirtualTid) {
        //     //Not sure of this logic yet.
        //     terminal.masterKey_1 = ExtractKeys.getDecryptedIswMasterKey(terminal.masterKey_1, "virtualtid");
        //     // terminal.sessionKey_1;
        // }else{
        //     // decryptedPinKey = await ExtractKeys.getIswFailoverDesPinblock(terminal.pinKey_1,terminal.masterKey_1,env)
        // }
        // console.log(decryptedPinKey, 'DECRYPTED FOR FAILOVER');

        // 100 to denote virtualTid
        let iswPinblock = await this.getIswFailoverDesPinblock(terminal, oldPinblock, env);
        // console.log(`CLEAR block binary CHECKER: ${iswPinblock}`);
        
        let dummyPinblock = iswPinblock.substr(0, 8);
        let dummyPinblockHex = Buffer.from(dummyPinblock, 'utf8').toString('hex').toLowerCase();

        // console.log(`dummy pinBlock ${dummyPinblock}`);
        // console.log(`dummy pinB hex ${dummyPinblockHex}`);

        Object.assign(requestData, unpackedMessage.dataElements);

        let subFieldMessage = baseSubFieldMessage;
        
        requestData['52'] = dummyPinblock;
        let terminalId = unpackedMessage.dataElements['41'];
        requestData['128'] = null;
        
        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";
        // console.log(requestData, 'request Data CHECK at failover=====>>>>>>>>>>>>>');

        let mainIso = this.ciso.packWithBinaryBitmap(unpackedMessage.mti, requestData);
        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');
        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));
        // replace the dummy pinblock with the orginal pinblock( to avoid character encodiing ish)
        hexIsoMessage = hexIsoMessage.replace(dummyPinblockHex, iswPinblock.toLowerCase());

        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        if (!xmlICC)
            return false;
        subFieldMessage['25'] = xmlICC;
        // subFieldMessage['33'] = '6008';
        subFieldMessage["2"] = "1673903725299400";
        subFieldMessage["3"] = "                        000936000936            ";
        subFieldMessage["13"] = "     000000   566";

        // Util.fileDataLogger(terminalId,"Request data \n" + JSON.stringify(requestData)+ "\n");
        // Util.fileDataLogger(terminalId,"subFieldMessage 127 \n"+  JSON.stringify(subFieldMessage)+ "\n");

        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);

        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');

        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);

        let requestMsg = Buffer.concat([binLength, bufferMsg]);

        Util.fileDataLogger(terminalId,`Sending ${requestMsg.toString()} transaction through INTERSWITCH at ${(new Date().toString())}`);
        
        let txnSocketclient = await this.setUpClientSocket("online failover", isFailoverRequest);
        if(!txnSocketclient) return false;

        let transactionSocketHandler = txnSocketclient.startClient(requestMsg);

        let self = this;
        return new Promise( (resolve, reject) => {

                transactionSocketHandler.on('data', data => {
                    // Util.fileDataLogger(terminalId,'purchase response: ' + Buffer.from(data).toString('hex'));
                    let message = Buffer.from(data).toString('hex');
                    let response = self.ciso.unpackWithBinaryBitmap(message);
                    Util.fileDataLogger(terminalId,`ISW Response at ONLINE failover: ${JSON.stringify(response)}`);
                    let responseData = self.mapInterswitchToNibssResponse(response);
                    if(!responseData) reject(false);
                    resolve(responseData);
                    transactionSocketHandler.end();
                });

                transactionSocketHandler.on('error', err => {
                    console.log('txn eRROR from sending to ISW', err);
                    reject(err);
                });

                transactionSocketHandler.on('close', () => {
                    console.log('txn Closed Client at ISW online');
                    Util.fileDataLogger(Util.getTerminalId(unpackedMessage), `ISW txn Socket Closed at ${(new Date().toString())}`);
                    let responseData = {};
                        responseData.interSwitchResponse = "99";
                        responseData.resCode = "99";
                        responseData.authCode = unpackedMessage ? unpackedMessage.dataElements[38] || '' : '';
                        responseData.iccResponse = null;
                    return responseData ? responseData : reject(false);
                });

                transactionSocketHandler.on('timeout', () => {
                    console.log('txn Client Timedout at ISW online');
                    Util.fileDataLogger(Util.getTerminalId(unpackedMessage), `ISW txn Socket Timedout at ${(new Date().toString())}`);
                    let responseData = {};
                        responseData.interSwitchResponse = "100";
                        responseData.resCode = "100";
                        responseData.authCode = unpackedMessage ? unpackedMessage.dataElements[38] || '' : '';
                        responseData.iccResponse = null;
                    return responseData ? responseData : reject(false);
                });

            }

        );

    }


     /**
     * interswitch failover reversal online card
     * @param {Object} unpackedMessage unpacked request from POS
     * @param {Object} terminal terminal object with nibbss and tams keys.
     * @returns {Promise<Object>}
     */
    async sendOnlineFailOverReversalTransaction(unpackedMessage, terminal, mw_handler = null, isFailoverRequest=false) {
        let requestData = {};
        
        let oldPinblock = unpackedMessage.dataElements['52'];
        let mw_instance = 1;
        if(mw_handler !== null) {
            mw_instance = mw_handler === 'POSVAS' ? 1 : 2;
        }
        const env = terminal.isVirtualTid ? "virtualtid" : 1;

        let iswPinblock = await this.getIswFailoverDesPinblock(terminal, oldPinblock, env);
        // console.log(`CLEAR block binary CHECKER: ${iswPinblock}`);
        
        let dummyPinblock = iswPinblock.substr(0, 8);
        let dummyPinblockHex = Buffer.from(dummyPinblock, 'utf8').toString('hex').toLowerCase();

        // console.log(`dummy pinBlock ${dummyPinblock}`);
        // console.log(`dummy pinB hex ${dummyPinblockHex}`);

        Object.assign(requestData, unpackedMessage.dataElements);

        requestData['52'] = dummyPinblock;
        requestData['56'] = "4021";
        requestData['59'] = unpackedMessage.dataElements['37'];
        requestData['128'] = null;

        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";

        let mainIso = this.ciso.packWithBinaryBitmap(unpackedMessage.mti || "0420", requestData);

        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');

        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));

        // replace the dummy pinblock with the orginal pinblock( to avoid character encodiing ish)
        // hexIsoMessage = hexIsoMessage.replace(dummyPinblockHex, pinblock.toLowerCase());
        hexIsoMessage = hexIsoMessage.replace(dummyPinblockHex, iswPinblock.toLowerCase());
        // console.log(`after pinblock replace ${hexIsoMessage}`);

        let subFieldMessage = baseSubFieldMessage;
        // console.log(requestData, 'request Data CHECK at failover REVERSALS =====>>>>>>>>>>>>>');
        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        if (!xmlICC)
            return false;
        subFieldMessage['25'] = xmlICC;
        // subFieldMessage['33'] = '6008';
        subFieldMessage["2"] = "1673903725299400";
        subFieldMessage["3"] = "                        000936000936            ";
        subFieldMessage["13"] = "     000000   566";

        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);

        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');

        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);

        let requestMsg = Buffer.concat([binLength, bufferMsg]);

        console.log(`Sending INTERSWITCH reversal terminalId ${Util.getTerminalId(unpackedMessage)}, RRN: ${Util.getRRN(unpackedMessage)} at ${(new Date().toString())}`);
        let socketclient = await this.setUpClientSocket("online reversal", isFailoverRequest);
        if(!socketclient) return false;

        let socketHandler = socketclient.startClient(requestMsg);
        let self = this;
        return new Promise( (resolve, reject) => {
                socketHandler.on('data', data => {

                let message = Buffer.from(data).toString('hex')
                let response = self.ciso.unpackWithBinaryBitmap(message);
                // console.log(JSON.stringify(response), 'reversal Response');

                let responseData = self.mapInterswitchToNibssResponse(response);
                // console.log(responseData, 'Response of Reversal');
                if(!responseData) reject(false);
                resolve({responseData, response});
                socketHandler.end();
            });

            socketHandler.on('error', err => {
                console.error(`Error Sending INTERSWITCH reversal resquest Data: ${err.toString()} at ${new Date().toString()}, terminalId ${Util.getTerminalId(unpackedMessage)}, RRN : ${Util.getRRN(unpackedMessage)}`)
                reject(err);
            });

            socketHandler.on('close', () => {
                console.log('Reversal txn Closed Client at ISW');
                let responseData = {};
                responseData.interSwitchResponse = "99";
                responseData.resCode = "99";
                    responseData.authCode = unpackedMessage ? unpackedMessage.dataElements[38] || '' : '';
                    responseData.iccResponse = null;
                return responseData ? responseData : reject(false);
            });

            socketHandler.on('timeout', () => {
                console.log('Reversal txn Client Timedout at ISW');
                let responseData = {};
                    responseData.interSwitchResponse = "100";
                    responseData.resCode = "100";
                    responseData.authCode = unpackedMessage ? unpackedMessage.dataElements[38] || '' : '';
                    responseData.iccResponse = null;
                return responseData ? responseData : reject(false);
            });
    })

    }

    /**
     * interswitch reversal online card
     * @param {Object} unpackedMessage unpacked request from POS
     * @param {Object} terminal terminal object with nibbss and tams keys.
     */
    async sendTransactionOnlineReversal(unpackedMessage, terminal) {

        let interConfig = await InterswitchConfig.getConfig();
        if (!interConfig)
            return false;

        let oldPinblock = unpackedMessage.dataElements['52'];
        let pinblock = this.getDesPinblock(terminal, oldPinblock, interConfig.pinKey);
        let dummyPinblock = pinblock.substr(0, 8);
        let dummyPinblockHex = Buffer.from(dummyPinblock, 'utf8').toString('hex').toLowerCase();

        requestData['3'] = `50${requestData['3'].substring(2,6)}`;



        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);
        let subFieldMessage = baseSubFieldMessage;

        requestData['52'] = dummyPinblock;
        requestData['55'] = null;
        requestData['53'] = null;

        requestData['56'] = "4021";
        requestData['59'] = unpackedMessage.dataElements['37'];
        requestData['28'] = null;
        requestData['90'] = Util.getReversalField90(unpackedMessage);
        requestData['95'] = "000000000000000000000000D00000000D00000000";
        requestData['128'] = null;

        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";
        let mainIso = this.ciso.packWithBinaryBitmap("0420", requestData);

        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');

        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));

        // replace the dummy pinblock with the orginal pinblock( to avoid character encodiing ish)
        hexIsoMessage = hexIsoMessage.replace(dummyPinblockHex, pinblock.toLowerCase());

        // console.log(`after pinblock replace ${hexIsoMessage}`);

        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        if (!xmlICC)
            return false;

        subFieldMessage['25'] = xmlICC;

        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);

        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');

        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);

        let requestMsg = Buffer.concat([binLength, bufferMsg]);

        console.log(`Sending INTERSWITCH reversal terminalId ${Util.getTerminalId(unpackedMessage)}, RRN : ${Util.getRRN(unpackedMessage)} at ${(new Date().toString())}`);
        let socketclient = await this.prepRequest("online reversal");
        if(!socketclient) return false;

        let socketHandler = socketclient.startClient(requestMsg);
        
        socketHandler.on('data', data => {

            let message = Buffer.from(data).toString('hex')
            let response = this.ciso.unpackWithBinaryBitmap(message);
            console.log(JSON.stringify(response));

            socketHandler.end();
            let responseData = this.mapInterswitchToNibssResponse(response);
            
            if(responseData){
                Journal.SaveInterswitchReversal(unpackedMessage, responseData, (err, res) => {
                    if (err)
                        console.error(`Error saving INTERSWITCH reversal response data: ${err.toString()} at ${new Date().toString()}`)
                    else {
                        console.log(`INTERSWITCH reversal completed at ${new Date().toString()}`);
                        console.log(res);
                    }
                });
            }

        });

        socketHandler.on('error', err => {
            console.error(`Error Sending INTERSWITCH reversal resquest Data: ${err.toString()} at ${new Date().toString()}, terminalId ${Util.getTerminalId(unpackedMessage)}, RRN : ${Util.getRRN(unpackedMessage)}`)
        });

    }

    /**
     * interswitch reversal offline card
     * @param {Object} unpackedMessage unpacked request from POS
     */
    async sendTransactionOfflineReversal(unpackedMessage) {
        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);
        let subFieldMessage = baseSubFieldMessage;

        requestData['3'] = `50${requestData['3'].substring(2,6)}`;
        
        requestData['55'] = null;
        requestData['53'] = null;

        requestData['56'] = "4021";
        requestData['59'] = unpackedMessage.dataElements['37'];
        requestData['28'] = null;
        requestData['90'] = Util.getReversalField90(unpackedMessage);
        requestData['95'] = "000000000000000000000000D00000000D00000000";

        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";
        let mainIso = this.ciso.packWithBinaryBitmap(unpackedMessage.mti, requestData);

        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');

        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));

        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        if (!xmlICC)
            return false;

        subFieldMessage['25'] = xmlICC;

        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);

        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');

        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');

        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);

        let requestMsg = Buffer.concat([binLength, bufferMsg]);

        console.log(`Sending INTERSWITCH reversal terminalId ${Util.getTerminalId(unpackedMessage)}, RRN : ${Util.getRRN(unpackedMessage)} at ${(new Date().toString())}`);
        let socketclient = await this.prepRequest("offline reversal");
        if(!socketclient) return false;

        let socketHandler = socketclient.startClient(requestMsg);
        
        socketHandler.on('data', data => {

            let message = Buffer.from(data).toString('hex')
            let response = this.ciso.unpackWithBinaryBitmap(message);
            console.log(JSON.stringify(response));

            socketHandler.end();
            let responseData = this.mapInterswitchToNibssResponse(response);
            
            if(responseData){
                Journal.SaveInterswitchReversal(unpackedMessage, responseData, (err, res) => {
                    if (err)
                        console.error(`Error saving INTERSWITCH reversal response data: ${err.toString()} at ${new Date().toString()}`)
                    else {
                        console.log(`INTERSWITCH reversal completed at ${new Date().toString()}`);
                        console.log(res);
                    }
                });
            }

        });

        socketHandler.on('error', err => {
            console.error(`Error Sending INTERSWITCH reversal resquest Data: ${err.toString()} at ${new Date().toString()}`)
        });

    }

    /**
     * 
     * @param {*} isoMessage 
     * @param {*} isFailoverRequest 
     * @returns {*} Promise<Object>
     */
    async sendOfflineFailoverReversalTransaction(unpackedMessage, isFailoverRequest=false){
        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);
        // console.log(requestData, 'Request Data before change');
        let subFieldMessage = baseSubFieldMessage;
        requestData['56'] = "4021";
        requestData['59'] = unpackedMessage.dataElements['37'];
        requestData['128'] = null;
        // set dummy data to avoid binary character encode ish of d127 bitmap
        requestData['127'] = "1";

        let mainIso = this.ciso.packWithBinaryBitmap(unpackedMessage.mti, requestData);
        let hexIsoMessage = mainIso.isoMessageBytes.toString('hex');
        // remove the dummy D127 and it's length
        hexIsoMessage = hexIsoMessage.substr(0, (hexIsoMessage.length - 14));
        let xmlICC = Util.mapICCDataToXML(unpackedMessage);
        // console.log(xmlICC, 'XML Data, ???');
        if (!xmlICC)
            return false;
        // console.log("subFieldMessage 127 \n", JSON.stringify(subFieldMessage), "\n");
        // console.log(`Sending Purchase transaction through INTERSWITCH at ${(new Date().toString())}`);

        subFieldMessage['25'] = xmlICC;
        // console.log("Request data after changes! \n", JSON.stringify(requestData), "\n");
        let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config['127'].nestedElements);
        let subIsoHex = subIso.isoMessageBytes.toString('hex');
        let subFieldLength = subIsoHex.length / 2;
        let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
        let paddedLengthHex = Buffer.from(paddedLength, 'utf8').toString('hex');
        // append 127 in hex to main iso message
        hexIsoMessage += paddedLengthHex;
        hexIsoMessage += subIsoHex;

        let bufferMsg = Buffer.from(hexIsoMessage, 'hex');
        let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);
        let requestMsg = Buffer.concat([binLength, bufferMsg]);

        console.log(`Sending INTERSWITCH reversal terminalId ${Util.getTerminalId(unpackedMessage)}, RRN : ${Util.getRRN(unpackedMessage)} at ${(new Date().toString())}`);
        let socketclient = await this.setUpClientSocket("offline failover reversal", isFailoverRequest);

        if (!socketclient) return;

        let socketHandler = socketclient.startClient(requestMsg);
        let self = this;
        return new Promise( (resolve, reject) => {
                socketHandler.on('data', data => {
                    // console.log('reversal response: ' + Buffer.from(data).toString('hex'));
                    let message = Buffer.from(data).toString('hex');
                    let response = self.ciso.unpackWithBinaryBitmap(message);
                    let responseData = self.mapInterswitchToNibssResponse(response);
                    socketHandler.end();
                    resolve(responseData);
                });

                socketHandler.on('error', err => {
                    console.log('eRROR at offline failover Reversal from sending to ISW', err);
                    reject(err);
                });

                socketHandler.on('close', () => {
                    console.log('Closed Client at offline failover Reversal ISW');
                    let responseData = {};
                    responseData.interSwitchResponse = "99";
                    responseData.resCode = "99";
                        responseData.authCode = unpackedMessage ? unpackedMessage.dataElements[38] || '' : '';
                        responseData.iccResponse = null;
                    return responseData ? responseData : reject(false);
                });

                socketHandler.on('timeout', () => {
                    console.log('Client Timedout at offline failover Reversal ISW');
                    responseData.interSwitchResponse = "100";
                    responseData.resCode = "100";
                        responseData.authCode = unpackedMessage ? unpackedMessage.dataElements[38] || '' : '';
                        responseData.iccResponse = null;
                    return responseData ? responseData : reject(false);
                });
            }
        );
    }

    /**
     * map interswitch response to nibss response for POS.
     * @param {Object} unpackedMessage unpacked message from Interswitch
     * @returns {Object} object with rescode, authCode and iccResponse
     */
     mapInterswitchToNibssResponse(unpackedMessage) {
        try {
        let responseData = {};
        responseData.interSwitchResponse = unpackedMessage.dataElements[39];
        responseData.resCode = unpackedMessage.dataElements[39] === '09' 
            ? '00' 
            : unpackedMessage.dataElements[39];
        // if (responseData.resCode == '00') {
            responseData.authCode = unpackedMessage.dataElements[38] || '';
            let unpackedSubfield = this.ciso.unpackSubfieldWithBinaryBitmap(unpackedMessage.dataElements['127'], config['127'].nestedElements);
            // console.log(`unpacked subfield : ${JSON.stringify(unpackedSubfield)}`);
            let iccResponse = Util.mapInterswitchICCresponseToNibbs(unpackedSubfield.dataElements[25]);
            if (iccResponse)
                responseData.iccResponse = iccResponse;
            else responseData.iccResponse = null;
        // }
        return responseData;
        } catch (error) {
            // console.log('Error at mapping response to NIBSS', error);
            Util.fileDataLogger(Util.getTerminalId(unpackedMessage), `${JSON.stringify(error)}`);
            return false;
        }
    }

    getDesPinblock(terminal, pinBlock, pinKey, keyversion=1) {

        Util.fileIsoLogger(terminal.terminalId, "terminal: "+ JSON.stringify(terminal));
        Util.fileIsoLogger(terminal.terminalId, "pinBlock: "+ pinBlock);
        Util.fileIsoLogger(terminal.terminalId, "pinKey: "+ pinKey);


        let clearPinkey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, keyversion);

        Util.fileIsoLogger(terminal.terminalId, "zmk (xor): "+ this.ZMK)

        Util.fileIsoLogger(terminal.terminalId, "clear Pin Key", clearPinkey);

        let cleanPinblock = Util.decrypt3DES(pinBlock, 'hex', clearPinkey, 'hex', 'hex');
        console.log(`clear pinblock: ${cleanPinblock}`);
        
        let cleanPwk = Util.decrypt3DES(pinKey.toUpperCase(),"hex",this.ZMK,"hex","hex");
        // let cleanPwk = pinKey;
        console.log('en pinkey '+pinKey.toUpperCase());
        console.log(`decrypt : ${cleanPwk}`);
        console.log(`pwk pin: ${Util.encrypt3DES(cleanPinblock, 'hex', cleanPwk, 'hex', 'hex' )}`);
        return Util.encrypt3DES(cleanPinblock, 'hex', cleanPwk, 'hex', 'hex' );
    }
    /**
     * 
     * @param {*} terminal 
     * @param {*} pinBlock 
     * @param {*} env 
     * @returns 
     */
    async getIswFailoverDesPinblock(terminal, pinBlock, env = 1) {
        let nibssPinkey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1,env);
        // console.log('decrypted PINkey from NI', nibssPinkey);
        let clearPinblock = Util.decrypt3DES(pinBlock,"hex",nibssPinkey,"hex","hex");
        // console.log(`clear pinBlock from NI ${clearPinblock}`);
        let masterKey = Util.xorISWComponentKey(env);
        // console.log('Component Keys/Masterkey', masterKey.toString('hex').toUpperCase());
        let encryptedPinKey = await Util.getIswKeys(Util.handlers.interswitchFailover);
        // console.log(encryptedPinKey, 'ISW en PINKEY');
        let iswClearPinKey = null;
        if(encryptedPinKey && encryptedPinKey.iswKey){
            iswClearPinKey = Util.decrypt3DES(encryptedPinKey.iswKey, 'hex', masterKey, 'hex', 'hex');
        }
        // console.log(iswClearPinKey, 'ISW DC PINKEY');
        let iswPinBlock = Util.encrypt3DES(clearPinblock,"hex",iswClearPinKey,"hex","hex");
        // console.log(`ISW new pinblock: ${iswPinBlock}`);
        return iswPinBlock;
    }


    async sendTransactionRequest(unpackedMessage, terminal, mw_handler = null) {

        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);

        console.log("RequestData: ", JSON.stringify(requestData));

        const interswitchResponse = !!unpackedMessage.dataElements["52"] 
            ? await this.sendOnlineTransaction(unpackedMessage, terminal, mw_handler) : this.sendOfflineTransaction(unpackedMessage);


        return interswitchResponse;

    }

    async sendFailoverTransactionRequest(unpackedMessage, nibssRequestData, terminal, mw_handler = null) {
        let requestData = {};
        let isFailover = true;
        Object.assign(requestData, unpackedMessage.dataElements);
        const interswitchResponse = !!unpackedMessage.dataElements["52"] 
            ? await this.sendOnlineFailOverTransaction(unpackedMessage, terminal, mw_handler, isFailover) 
            : this.sendOfflineFailoverTransaction(nibssRequestData, isFailover);
        return interswitchResponse;
    }

    async sendReversalRequest(unpackedMessage, terminal) {

        let requestData = {};
        Object.assign(requestData, unpackedMessage.dataElements);

        const interswitchResponse = !!unpackedMessage.dataElements["52"] 
            ? await this.sendTransactionOnlineReversal(unpackedMessage, terminal) : this.sendTransactionOfflineReversal(unpackedMessage);


        return interswitchResponse;

        
    }

    /**
     * 
     * @param {*} unpackedMessage
     * @param {*} nibssRequestData
     * @param {*} terminal
     * @param {*} mw_handler
     * @returns
     */
    async sendFailoverReversalRequest(unpackedMessage, nibssRequestData, terminal, mw_handler = null){
        // let requestData = {};
        let isFailover = true;
        // Object.assign(requestData, unpackedMessage.dataElements);
        const interswitchResponse = !!unpackedMessage.dataElements["52"] 
            ? this.sendOnlineFailOverReversalTransaction(unpackedMessage, terminal, mw_handler, isFailover)
            : this.sendOfflineFailoverReversalTransaction(nibssRequestData, isFailover);
        return interswitchResponse;
    }


}

module.exports = interswitchHander;
