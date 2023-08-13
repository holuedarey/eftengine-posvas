/**
 * @author Abolaji
 */

require('dotenv').config();
const fetch = require("node-fetch");
const Util = require('../helpers/Util');
const TerminalKey = require('../model/terminalkeysModel');
const convert = require("xml-js");
const transactionTypes = require('../config/transactionTypeMap.json');
const ExtractKeys = require('../helpers/ExtractKeys');

const SocketClient = require('../socket/socketclient');

class TamsHandler {
    constructor(config, unpackedMessage, isoPacker = null ,isTest = false) {
        // this.isoParser = isoParser;
        this.unpackedMessage = unpackedMessage;

        // let terminalId = Util.getTerminalId(this.unpackedMessage);
        this.config = config;
        this.Tams_IP = isTest ? this.config.tams.IP_TEST : this.config.tams.IP_LIVE;
        this.Tams_Port = isTest ? this.config.tams.PORT_TEST : this.config.tams.PORT_LIVE;
        let protocol = 'http://';
        this.Tams_Url = `${protocol}${this.Tams_IP}:${this.Tams_Port}`;
        // console.log(this.Tams_Url)

        this.isoPacker = isoPacker
    }

    /**
     * calls eftTotal on tams to get the batch number
     * @param {Number} batchNo batch number from db
     * @param {String} hashKey Clear sessionKey
     * @param {String} terminalId Terminal ID from request
     */
    async getBatchNumber(batchNo, hashKey, terminalId) {
        let requestData = `${batchNo}0000000000`;
        let signedData = Util.doSha256(hashKey, requestData);
        let headers = {
            'Accept': 'application/xml',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'lipman/8.0.6',
            'EOD': '0',
            'Sign': 'S' + signedData,
            // the terminal id from field 41
            'Terminal': terminalId,
            'cache-control': 'no-cache',
        };

        let url = this.Tams_Url + `/tams/eftpos/devinterface/efttotals.php?BATCHNO=${batchNo}&T=0&A=0&PC=0&PV=0&PRC=0&PRV=0&RC=0&RV=0&RRC=0&RRV=0`;

        return fetch(url, {
                method: 'POST',
                headers: headers,
                // agent: this.agent
            })
            .then(res => res.text())
            .then(text => {
                // console.log(text);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),text);
                let result = JSON.parse(this.convertJSONtoXML(text));
                return result.efttotals.batchno._text;
            })
            .catch(e => {
                console.log('Error: ' + e);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'Error: ' + e);
                return false;
            });
    }


    getKeysHeaders(terminalId) {
        return {
            'Accept': 'application/xml',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': '0',
            'User-Agent': ' lipman/8.0.6',
            'EOD': '0',
            // the terminal id from field 41
            'Terminal': terminalId,
            'cache-control': 'no-cache',
        };
    }

    convertJSONtoXML(xml) {
        let complete_xml = xml;
        let json = convert.xml2json(complete_xml, {
            compact: true,
            spaces: 4
        });
        return json;
    }


    async getTamsDetails() {
        let terminalId = Util.getTerminalId(this.unpackedMessage);

        try {
            let term = await TerminalKey.findTerminal(terminalId);
            let Terminal = {
                batchNo: 0
            };
            if (term) {
                Terminal = term;
            }
            Terminal.terminalId = terminalId;

            //due to "Terminal is not allowed to change masterKey from Tams" error 
            // if (!Terminal.masterKey_tams) {
                let masterKey = await this.getTamsMasterKey(terminalId);
                if(masterKey != false && masterKey != 'false')
                    Terminal.masterKey_tams = masterKey;
            // }

            let sessionKeys = await this.getTamsSessionKeys(terminalId);
            Terminal.sessionKey_tams0 = sessionKeys[0];
            Terminal.sessionKey_tams1 = sessionKeys[1];
            Terminal.sessionKey_tams2 = sessionKeys[2];

            if (Terminal.masterKey_tams && sessionKeys.length > 0) {
                let hashKey = Util.decryptTamsSessionKeys1(sessionKeys[1], 'hex', sessionKeys[0], terminalId, Terminal.masterKey_tams, 'hex');

                let batchNo = await this.getBatchNumber(Terminal.batchNo, hashKey, terminalId);
                if (batchNo != Terminal.batchNo && batchNo != false) {
                    Terminal.batchNo = batchNo;
                    Terminal.sequenceNumber = 0;
                }

                let params = await this.getTamsParamaters(hashKey, terminalId);
                if (params) {
                    Terminal.mechantID_tams = params.merchantid;
                    Terminal.countryCode_tams = params.countrycode;
                }
            }

            if (term) {
                TerminalKey.updateOne({
                    terminalId: terminalId
                }, Terminal, function (err, data) {
                    if (process.env.APP_ENV == "local") {
                        if (err){
                            console.log(`error saving tams masterKey: ${err.toString()}`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`error saving tams masterKey: ${err.toString()}`);
                        }else{
                            console.log(`saved tams masterkey key`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`saved tams masterkey key`);
                        }
                    }
                });
            } else {
                TerminalKey.create(Terminal, function (err, data) {
                    if (process.env.APP_ENV == "local") {
                        if (err){
                            console.log(`error saving tams masterKey: ${err.toString()}`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`error saving tams masterKey: ${err.toString()}`);
                        }else{
                            console.log(`saved tams masterkey key`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`saved tams masterkey key`);
                        }
                    }
                });
            }

        } catch (e) {
            console.error(`error getting tams details: \n ${e}`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`error getting tams details: \n ${e}`);
        }
    }

    /**
     * get param from tams
     * @param {String} hashKey clear tams sessionKey
     * @param {String} terminalId Terminal ID from request
     */
    async getTamsParamaters(hashKey, terminalId) {

        let tlv = this.unpackedMessage.dataElements[62];
        let len = tlv.substr(2, 3);
        let serial = tlv.substr(5, Number.parseInt(len));

        let requestData = `1${serial}`;
        let signedData = Util.doSha256(hashKey, requestData);
        let headers = {
            'Accept': 'application/xml',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'lipman/8.0.6',
            'EOD': '0',
            'Sign': 'S' + signedData,
            // the terminal id from field 41
            'Terminal': terminalId,
            'cache-control': 'no-cache',
        };

        let url = this.Tams_Url + `/tams/tams/devinterface/getparams.php?ver=1&serial=${serial}`;

        return fetch(url, {
                method: 'POST',
                headers: headers,
                // agent: this.agent
            })
            .then(res => res.text())
            .then(async (text) => {
                // console.log(text);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),text);
                let result = JSON.parse(this.convertJSONtoXML(text));
                let params = result.param;
                if (params) {
                    let data = {
                        merchantid: params.merchantid._text,
                        countrycode: params.countrycode._text
                    };
                    return data;
                }
                return false;
            })
            .catch(e => {
                console.log('Error: ' + e);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'Error: ' + e);
                return false;
            });
    }

    /**
     * get masterkey from tams
     * @param {String} terminalId terminal Id from request
     */
    async getTamsMasterKey(terminalId) {
        let url = this.Tams_Url + '/tams/tams/devinterface/newkey.php';
        const headers = this.getKeysHeaders(terminalId);

        return fetch(url, {
                method: 'post',
                headers: headers,
            })
            .then(res => res.text())
            .then(text => {
                // console.log(text);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),text);
                let strKey = this.convertJSONtoXML(text);
                let masterKey = JSON.parse(strKey);
                if(masterKey.newkey)
                    return masterKey.newkey.masterkey._text;
                return false;
            })
            .catch(e => {
                console.log('Error: ' + e);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'Error: ' + e);
                return false;
            });
    }

    /**
     * 
     * @param {String} terminalId Terminal Id from request
     */
    async getTamsSessionKeys(terminalId) {

        let url = this.Tams_Url + '/tams/tams/devinterface/getkeys.php';

        const headers = this.getKeysHeaders(terminalId);

        return fetch(url, {
                method: 'post',
                headers: headers,
                // agent: this.agent
            })
            .then(res => res.text())
            .then(text => {
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),text);

                let strKey = this.convertJSONtoXML(text);
                let sessionKey = JSON.parse(strKey);
                let keys = [];
                keys.push(sessionKey.getkeys.cipher[0].key._text);
                keys.push(sessionKey.getkeys.cipher[1].key._text);
                keys.push(sessionKey.getkeys.cipher[2].key._text);
                return keys;
            })
            .catch(e => {
                console.log('Error: ' + e);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'Error: ' + e);

                return false;
            });
    }

    /**
     * convert ISO message to Tams message format
     * @param {Object} Terminal Terminal Object from DB
     */
    async mapTransactionData(Terminal) {
        let messageArray = [];
        messageArray[0] = Util.getTamsTransactionType(this.unpackedMessage);
        messageArray[1] = Terminal.batchNo;
        messageArray[2] = (await TerminalKey.getSequenceNumber(Terminal.terminalId));
        messageArray[3] = Terminal.mechantID_tams;
        messageArray[4] = new Date().getTime();

        let encryptKey = Util.decryptTamsSessionKeys2(Terminal.sessionKey_tams2,Terminal.sessionKey_tams1, 'hex', Terminal.sessionKey_tams0 , Terminal.terminalId, Terminal.masterKey_tams, 'hex');
        console.log('encrypting key '+encryptKey);
        let track2 = this.unpackedMessage.dataElements[35];
        messageArray[5] = 'E' + Util.encryptRC4(track2,'ascii',encryptKey,'hex','hex');
        // messageArray[5] = this.unpackedMessage.dataElements[35];
        messageArray[6] = "";
        messageArray[7] = "0";
        messageArray[8] = "N";
        messageArray[9] = Number.parseInt(this.unpackedMessage.dataElements[4]);
        messageArray[10] = '0';
        messageArray[11] = '0';
        messageArray[12] = '0';

        let acctFrom = this.unpackedMessage.dataElements[3].substr(2, 2);
        let acctTo = this.unpackedMessage.dataElements[3].substr(4, 2);
        messageArray[13] = acctFrom + '|' + acctTo;

        let pinBlock = Util.getPinBLock(this.unpackedMessage);
        let KSN = '';

        if (pinBlock) {
            let paddedSN = Util.padLeft(messageArray[2].toString(),'0',5);

            KSN = this.config.tams.BDK_NAME + '12345678E' + paddedSN;
            let clearPinkey = ExtractKeys.getDecryptedPinKey(Terminal.pinKey_1, Terminal.masterKey_1, 1);

            // if(nibssVer == 1)
            // {
            //     clearPinkey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, 1);
            // }
            // else{
            //     clearPinkey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_2, terminal.masterKey_2, 2);
            // }
            
            let cleanPinblock = Util.decrypt3DES(pinBlock, 'hex', clearPinkey, 'hex', 'hex');
            
            let paddedKSN = Util.padLeft(KSN,'F',20);
        
            pinBlock = Util.getDukptPinblock(cleanPinblock, paddedKSN ,this.config);

            // console.log('clear pin block: '+ cleanPinblock);
        }

        messageArray[14] = pinBlock ? pinBlock : "OFFLINE";
        messageArray[15] = pinBlock ? KSN : ""; 

        messageArray[16] = "N";
        messageArray[17] = "N";
        messageArray[18] = "0";
        // messageArray[19] = this.unpackedMessage.dataElements[37];
        messageArray[19] = "";
        messageArray[20] = "";
        messageArray[21] = "";
        messageArray[22] = "";
        messageArray[23] = "";
        messageArray[24] = "";
        messageArray[25] = this.unpackedMessage.dataElements[49];
        // messageArray[25] = Terminal.countryCode_tams;
        messageArray[26] = "";
        messageArray[27] = "";
        messageArray[28] = "";
        messageArray[29] = "";
        messageArray[30] = "";
        messageArray[31] = "";
        messageArray[32] = "";
        messageArray[33] = Util.mapICCData(this.unpackedMessage,messageArray[2]);

        let requestData = "";
        messageArray.forEach(d=>{
            requestData+= d + ',';
        });

        return requestData;
    }

    /**
     * convert ISO message to Tams message format
     * @param {Object} Terminal Terminal Object from DB
     * @param {Number} nibssVer nibss key to decrypt pinkey
     */
    async mapTransactionDataRequeryReversal(Terminal,journal) {
        let messageArray = [];
        messageArray[0] = Util.getTamsTransactionType(this.unpackedMessage);
        messageArray[1] = journal.tamsBatchNo;
        messageArray[2] = journal.tamsTransNo;
        messageArray[3] = Terminal.mechantID_tams;
        messageArray[4] = new Date('').getTime();

        let encryptKey = Util.decryptTamsSessionKeys2(Terminal.sessionKey_tams2,Terminal.sessionKey_tams1, 'hex', Terminal.sessionKey_tams0 , Terminal.terminalId, Terminal.masterKey_tams, 'hex');
        console.log('encrypting key '+encryptKey);
        let track2 = this.unpackedMessage.dataElements[35];
        messageArray[5] = 'E' + Util.encryptRC4(track2,'ascii',encryptKey,'hex','hex');
        // messageArray[5] = this.unpackedMessage.dataElements[35];
        messageArray[6] = "";
        messageArray[7] = "0";
        messageArray[8] = "N";
        messageArray[9] = Number.parseInt(this.unpackedMessage.dataElements[4]);
        messageArray[10] = '0';
        messageArray[11] = '0';
        messageArray[12] = '0';

        let acctFrom = this.unpackedMessage.dataElements[3].substr(2, 2);
        let acctTo = this.unpackedMessage.dataElements[3].substr(4, 2);
        messageArray[13] = acctFrom + '|' + acctTo;

        let pinBlock = Util.getPinBLock(this.unpackedMessage);
        let KSN = '';

        if (pinBlock) {
            let paddedSN = Util.padLeft(messageArray[2].toString(),'0',5);

            KSN = this.config.tams.BDK_NAME + '12345678E' + paddedSN;
            let clearPinkey = '';

            // if(nibssVer == 1)
            // {
            //     clearPinkey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, 1);
            // }
            // else{
            //     clearPinkey = ExtractKeys.getDecryptedPinKey(terminal.pinKey_2, terminal.masterKey_2, 2);
            // }
            
            let cleanPinblock = Util.decrypt3DES(pinBlock, 'hex', clearPinkey, 'hex', 'hex');
            
            let paddedKSN = Util.padLeft(KSN,'F',20);
        
            pinBlock = Util.getDukptPinblock(cleanPinblock, paddedKSN ,this.config);

            // console.log('clear pin block: '+ cleanPinblock);
        }

        messageArray[14] = pinBlock ? pinBlock : "OFFLINE";
        messageArray[15] = pinBlock ? KSN : ""; 

        messageArray[16] = "N";
        messageArray[17] = "N";
        messageArray[18] = "0";
        messageArray[19] = "";
        messageArray[20] = "";
        messageArray[21] = "";
        messageArray[22] = "";
        messageArray[23] = "";
        messageArray[24] = "";
        messageArray[25] = this.unpackedMessage.dataElements[49];
        // messageArray[25] = Terminal.countryCode_tams;
        messageArray[26] = "";
        messageArray[27] = "";
        messageArray[28] = "";
        messageArray[29] = "";
        messageArray[30] = "";
        messageArray[31] = "";
        messageArray[32] = "";
        messageArray[33] = Util.mapICCData(this.unpackedMessage,messageArray[2]);

        let requestData = "";
        messageArray.forEach(d=>{
            requestData+= d + ',';
        });

        return requestData;
    }


    /**
     * process transaction with tams
     * @param {String} requestData mapped request data
     * @param {Object} Terminal Terminal Object from DB
     */
    async processTransaction(requestData,Terminal)
    {
        let hashKey = Util.decryptTamsSessionKeys1(Terminal.sessionKey_tams1, 'hex', Terminal.sessionKey_tams0 , Terminal.terminalId, Terminal.masterKey_tams, 'hex');
        let signedData = Util.doSha256(hashKey, requestData);
        // console.log(signedData);
        
        let headers = {
            'Accept': 'application/xml',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'lipman/8.0.6',
            'EOD': '0',
            'Sign': 'S' + signedData,
            // the terminal id from field 41
            'Terminal': Terminal.terminalId,
            'cache-control': 'no-cache',
        };

        let url = this.Tams_Url + `/tams/eftpos/devinterface/transaction.php?T[0]=${requestData}`;

        return fetch(url, {
                method: 'POST',
                headers: headers,
                // agent: this.agent
            })
            .then(res => res.text())
            .then(text => {
                // console.log(text);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),text);

                let parsedResult = '';
                try {
                   parsedResult = this.convertJSONtoXML(text);
                } catch (e) {
                    console.log(text+'\n');
                    console.log('\nTamsHandler_processTransaction Error: ' + e +'\n');
                    return false;
                }

                let result = JSON.parse(parsedResult);
                if(result.efttran)
                {
                    let res = {
                        status: result.efttran.tran.status._text,
                        message: result.efttran.tran.message._text,
                        tranNo: result.efttran.tran.tranno._text,
                        batchNo: result.efttran.tran.batchno._text,
                        authId : result.efttran.tran.authid ? result.efttran.tran.authid._text : '',
                        iccResponse : result.efttran.tran.iccresponse ? result.efttran.tran.iccresponse._text : '',
                        rrn : result.efttran.tran.refno ? result.efttran.tran.refno._text : ''
                    };
                    return res;
                }
                return false;   
            })
            .catch(e => {
                console.log('TamsHandler_processTransaction Error: ' + e);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'TamsHandler_processTransaction Error: ' + e);

                return false;
            });
    }


    async processReversal(requestData,Terminal)
    {
        let requestMsg = requestData.split(',');
        requestMsg[18] = requestMsg[2];
        requestMsg[22] = requestMsg[4];
        requestMsg[23] = requestMsg[0];

        requestMsg[0] = '4';
        requestMsg[4] = new Date().getTime();
        requestMsg[2] = (await TerminalKey.getSequenceNumber(Terminal.terminalId));

        requestData = '';
        requestMsg.forEach(d=>{
            requestData+= d + ',';
        });

        // console.log(`tams reversal message ${requestData}`);


        let hashKey = Util.decryptTamsSessionKeys1(Terminal.sessionKey_tams1, 'hex', Terminal.sessionKey_tams0 , Terminal.terminalId, Terminal.masterKey_tams, 'hex');
        let signedData = Util.doSha256(hashKey, requestData);
        // console.log(signedData);
        
        let headers = {
            'Accept': 'application/xml',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'lipman/8.0.6',
            'EOD': '0',
            'Sign': 'S' + signedData,
            // the terminal id from field 41
            'Terminal': Terminal.terminalId,
            'cache-control': 'no-cache',
        };

        let url = this.Tams_Url + `/tams/eftpos/devinterface/transaction.php?T[0]=${requestData}`;

        return fetch(url, {
                method: 'POST',
                headers: headers,
                // agent: this.agent
            })
            .then(res => res.text())
            .then(text => {
                // console.log(text);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),text);

                let parsedResult = this.convertJSONtoXML(text);
                let result = JSON.parse(parsedResult);
                if(result.efttran)
                {
                    let res = {
                        status: result.efttran.tran.status._text ? result.efttran.tran.status._text : '',
                        message: result.efttran.tran.message._text ? result.efttran.tran.message._text : '',
                        tranNo: result.efttran.tran.tranno._text ? result.efttran.tran.tranno._text : '',
                        batchNo: result.efttran.tran.batchno._text ? result.efttran.tran.batchno._text : '',
                        authId : result.efttran.tran.status._text == '000' ? result.efttran.tran.authid._text : '',
                        iccResponse : result.efttran.tran.status._text == '000' ? result.efttran.tran.iccresponse._text : ''
                    };
                    return res;
                }
                return false;
                 
            })
            .catch(e => {
                console.log('Error: ' + e);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),'Error: ' + e);

                return false;
            });
    }

    /**
     * use to send fail-over request to middleware-tams installed for bank
     * for fail-over purposes. installed middle map the to/fro the TAMS.
     * @param {*} Terminal temimal id of the terminal
     * @returns {Buffer} iso buffer from tams
     */
    async processMiddleWareTAMSTransaction(Terminal){
        let clearPinkey = ExtractKeys.getDecryptedPinKey(Terminal.pinKey_1, Terminal.masterKey_1, 1);

        let hashKey = ExtractKeys.getDecryptedSessionKey(Terminal.sessionKey_1,Terminal.masterKey_1, 1);
        
        let requestData = {};
        Object.assign(requestData, this.unpackedMessage.dataElements);
        let customerRef = requestData[59] || "";
        requestData[59] = `${this.config.name}${clearPinkey}~` + customerRef;

        // Util.fileDataLogger(Terminal.terminalId, `Request data sent to EFT-GTB-FAILOVER TAMS MIddleware ${JSON.stringify(requestData)}`);

        let isoRequestData = ExtractKeys.rehashUnpackedIsoMessage(requestData,this.isoPacker,hashKey, "0200");

        Util.fileDataLogger(Terminal.terminalId, `The ISO Message sent to EFT-GTB-FAILOVER TAMS MIddleware ${Buffer.from(isoRequestData).toString('utf-8')}`);

        let clientSocket = new SocketClient(this.Tams_IP,this.Tams_Port,true);

        let socketHandler = clientSocket.startClient(isoRequestData, 50000);

        let self = this;
        return new Promise(
            function (resolve, reject) {

                socketHandler.on('data', data => {
                    console.log(data.toString())
                    console.log(`middleware TAMS responded RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                    Util.fileDataLogger(Util.getTerminalForLog(self.unpackedMessage),`middleware EFT-GTB-FAILOVER TAMS responded RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                    
                    socketHandler.end();
                    resolve(data);
                });

                socketHandler.on('error', err => {
                    console.log(`middleware TAMS ${err.message}`);
                    Util.fileDataLogger(Util.getTerminalForLog(self.unpackedMessage),`middleware TAMS ${err.message}`);

                    reject(err);
                });
                socketHandler.on('timeout', () => {
                    console.error(`middleware TAMS TIMEDOUT RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                    Util.fileDataLogger(Util.getTerminalForLog(self.unpackedMessage),`middleware TAMS TIMEDOUT RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                    
                    reject(`middleware TAMS TIMEDOUT RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                });
                socketHandler.on('close', () => {
                    console.error(`middleware TAMS close connection, RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                    Util.fileDataLogger(Util.getTerminalForLog(self.unpackedMessage), `middleware TAMS close connection, RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);

                    reject(`middleware TAMS close connection, RRN ${Util.getRRN(self.unpackedMessage)} terminal ${Terminal.terminalId} at ${new Date().toString()}`);
                });
            }

        );

    }
    

}

module.exports = TamsHandler;
// 22540001
