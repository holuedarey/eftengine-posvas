/**
 * @author Abolaji
 * @module Util
 */
require('dotenv').config();
const crypto = require('crypto');
const bufferXor = require('buffer-xor');
const TransTypes = require('../config/transactionTypeMap.json');
const TlvTags =  require('../config/tvlTags.json');
const ejournalTLVTags = require('../config/ejournaltlvtags.json');
const ResponseMap = require('../config/responseMap.json');
const Dukpt = require('../Dukpt/dukpt.lib');
const TamsConfigs = require('../config/tamsConfigs.json');
const neolifeConfig = require('../config/NeoLifeConfig.json');
const Xml2js = require('xml-js');
const SimpleNodeLogger = require('simple-node-logger');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const cryptojs = require('crypto-js');
const { v4: uuidv4 } = require('uuid');
// const uniqueRandom = require('unique-random');
const nano = require('nano-seconds');
const iswTerminalKey = require('../model/iswTerminalKeyModel');

 module.exports = {

    failoverResponses:  [''],
    keysProcessingCodes : ['9A', '9B', '9G'],
    keysExchangeProcessingCodes : ['9A', '9B', '9G', '9C'],
    TmkProcessingCode : '9A',
    TpkProcessingCode : '9G',
    SkProcessingCode : '9B',
    GParamProcessingCode : '9C',
    CallHomeProcessingCode : '9D',
    configDataTags : [
        //Merchant Id 
        '03015' ,
        //Merchant's name
        '52040',
        //Currency Code
        '05003',
        //Country Code
        '06003',
        //Merchant Category Code
        '08004'
    ],
    handlers : {
        nibss1 : process.env.handler,
        nibss2  : process.env.handler_2,
        tams : process.env.handler_tams, //fund end processor
        interswitch : process.env.handler_interswitch,
        interswitchFailover: 'ISW_FAILOVER',
        tamsMW : "MW-FEP",
        upsl : process.env.handler_upsl
    },

    /**
     * check iso message request type
     * @param {Object} unpackedMessage unpacked iso message
     * @param {String} msgType message type to check for
     * @returns {Boolean} 
     */
    isMitType(unpackedMessage,msgType){
        return unpackedMessage.mti.substring(0, 2) == msgType;
    },

    /**
     * 
     * @param {*} unpackedMessage 
     * @param {*} msgType 
     * @returns 
    */
    isMtiType(unpackedMessage,msgType){
        return unpackedMessage.mti.substring(0, 2) == msgType;
    },


    extractVirtualTIDKeys(unpackedMessage) {

        if(unpackedMessage.dataElements[53] === null) {
            return false;
        }

        return unpackedMessage.dataElements[53].split("0000");

    },

    /**
     * extract response code from the unpacked message dataElements
     * @param {Object} unpackedMessage unpacked iso  message
     * @returns {String} response code
     */
    getResponseCode(unpackedMessage){
        return unpackedMessage.dataElements[39];
    },

    isWithdrawalVirtualTidRequest(unpackedMessage) {
        return unpackedMessage.dataElements[53] !== null;
    },

    /**
     * get processing code from the unpacked iso message
     * @param {Object} unpackedMessage
     * @returns {String} processCode
     */
    getProcessingCode(unpackedMessage){
        return unpackedMessage.dataElements[3].substr(0, 2);
    },

    /**
     *get the terminal Id from the iso message
     *@param {Object} unpackedMessage
     *@returns {String} terminal Id
     */
    getTerminalId(unpackedMessage){
        return unpackedMessage.dataElements[41] || null;
    },

    /**
     * get key from network message
     * @param  {Object} unpackedMessage
     * @returns {String} key
     */
    getSecurityKey(unpackedMessage){
        if(unpackedMessage.dataElements[53])
            return unpackedMessage.dataElements[53].substring(0,32);
        else return "";
    },

    getRRN(unpackedMessage){
        return unpackedMessage.dataElements[37];
    },

    generateNewRRN(){
        return `${uuidv4().replace("-", "").substring(0, 12).toUpperCase()}`;
    },


    //
    generateRandValforRRN(){
        // const random = uniqueRandom(min, max);
        // return random().toString();

        // use nano to generate unique rrn
        const ns = nano.now();
        return nano.toString(ns).slice(5,17);
    },

    /**
     * check if the request data RRN is different from response RRN,
     *  if it's different, there must have been a failover request
     * @param {Object} unpackedMessage unpacked request data from pos
     * @param {Object} unpackedServerResponse response from server
     */
    getFailOverRRN(unpackedMessage,unpackedServerResponse){
        let oldRRN = this.getRRN(unpackedMessage);
        let newRRN = this.getRRN(unpackedServerResponse);
        return oldRRN == newRRN ? '' : newRRN;
    },

    /**
     * check if it's a key request
     * @param {Object} unpackedMessage
     * @returns {Boolean} 
     */
    isKeyRequest(unpackedMessage){
        let processingCode =  this.getProcessingCode(unpackedMessage);
        return this.keysProcessingCodes.find(c => c == processingCode);
    },

    /**
     * check if it's a key request
     * @param {Object} unpackedMessage
     * @returns {Boolean} 
     */
    isKeyExchange(unpackedMessage){
        let processingCode =  this.getProcessingCode(unpackedMessage);
        return this.keysExchangeProcessingCodes.find(c => c == processingCode);
    },

    /**
     * convert data to base64 string and returns sha512 of the base64 string
     * @param {Object | String} theData data to encrypt
     * @returns {String}
     */
    encodeBase64(theData) {
        return Buffer.from(theData).toString('base64');
    },

    SHA256Base64(theData) {
        let hash = crypto.createHash('sha256').update(theData).digest('base64');
        return hash;
    },

    signSHA512(theData) {

        let base64Encoded = Buffer.from(theData).toString('base64');

        let hash = crypto.createHash('sha512');

        hash.update(base64Encoded);
         
        return hash.digest('hex');
    },

    signSHA512Vas(theData) {

        // let data = Buffer.from(theData,"utf-8");

        let hash = crypto.createHash('sha512');

        hash.update(theData);
         
        return hash.digest('hex');
    },

    signSHA1(theData) {

        let hash = crypto.createHash('sha1');

        hash.update(theData);
         
        return hash.digest('hex');
    },
    
    // do sha256 of the data with key
    signIsoMessage(key, data) {
        let k = Buffer.from(key,'hex');
        let hash = crypto.createHash('sha256');
        hash.update(k)
        hash.update(data);
        return hash.digest('hex');
    },

    // do sha256 of the data with key
    doSha256withoutKey(data) {
        let hash = crypto.createHash('sha256');
        
        hash.update(Buffer.from(data,'hex'));
        return hash.digest('hex');
    },

    // do sha256 of the data with key
    doSha256(key, data) {
        let k = Buffer.from(key,'hex');
        let hash = crypto.createHash('sha256');
        hash.update(k)
        hash.update(data);
        return hash.digest('hex');
    },


    /**
     * xor two hex string
     * @param {String} value_1 operand 1 in hex
     * @param {String} value_2 operand 2 in hex
     * @returns {String} xor result in hex
     */
    xorHexString(value_1,value_2){
        let a = Buffer.from(value_1, 'hex')
        let b = Buffer.from(value_2, 'hex');
        let result = bufferXor(a,b);
        return result;
    },

    /**
     * XOR the two component keys
     * @param {Boolean} isTest
     * @returns {String} xor componentKeys 
     */
    xorComponentKey(nibssVer){
        console.log(nibssVer);

        let key_1 = nibssVer == 1 ? process.env.LIVE_KEY_1 : nibssVer == 2 ? process.env.NIBSS_2_KEY_1 : process.env.UP_COM_1;
        let key_2 = nibssVer == 1 ? process.env.LIVE_KEY_2 : nibssVer == 2 ? process.env.NIBSS_2_KEY_2 : process.env.UP_COM_2;

        console.log(nibssVer + "KEY 1 ", key_1);
        console.log(nibssVer + "KEY 2 ", key_2);
        return this.xorHexString(key_1,key_2);   
    },

    /**
     * XOR the two component keys
     * @param {Boolean} isTest
     * @returns {String} xor componentKeys 
     */
    xorISWComponentKey(nibssVer){
        console.log(nibssVer, 'AT isw xorComponentKey');

        let key_1 = nibssVer == 1 ? process.env.ISW_LIVE_KEY_1 : nibssVer == 2 ? process.env.NIBSS_2_KEY_1 : process.env.UP_COM_1;
        let key_2 = nibssVer == 1 ? process.env.ISW_LIVE_KEY_2 : nibssVer == 2 ? process.env.NIBSS_2_KEY_2 : process.env.UP_COM_2;
        let key_3 = nibssVer == 1 ? process.env.ISW_LIVE_KEY_3 : nibssVer == 2 ? process.env.NIBSS_2_KEY_1 : process.env.UP_COM_1;

        let combinedKey = this.xorHexString(key_1,key_2);
        console.log(combinedKey.toString('hex'))
        return this.xorHexString(combinedKey,key_3);
    },

    async saveIswPinKey(handler, unpackedMessage){
        try {
            let updateDbVal = {
                iswPinKey: unpackedMessage.dataElements[53].slice(0,32),
                keyCheck: unpackedMessage.dataElements[53].slice(32, 38)
            };
            // console.log('SAVING ISW pin Keys', updateDbVal);
            await iswTerminalKey.createOrUpdate(
                handler,
                updateDbVal,
            );
            // console.log(result ,'created PINKey>>>>>>>>>>>>>');
            return true;
        } catch (error) {
            return false;
        }
      },
    
      async getIswKeys(handler){
        // const terminalkeys = await iswTerminalKey.findKey(handler);
        return iswTerminalKey.findKey(handler);
        // return terminalkeys;
      },
    
    
    /**
     * 
     * @param {*} keyVersion 
     * @returns {Buffer} Hexadecimal representation
     */
    xorAccessRoutingComponentKey(keyVersion){
        console.log(keyVersion);

        let key_1 = keyVersion === 1 ? process.env.ACCESS_ROUTE_KEY1 : keyVersion == 2 ? process.env.LIVE_KEY_1 : process.env.UP_COM_1;
        let key_2 = keyVersion === 1 ? process.env.ACCESS_ROUTE_KEY2 : keyVersion == 2 ? process.env.LIVE_KEY_2 : process.env.UP_COM_2;

        console.log(keyVersion + "KEY 1 ", key_1);
        console.log(keyVersion + "KEY 2 ", key_2);
        return this.xorHexString(key_1,key_2);
    },

    
    /**
     * decrypt session key 1 with RC4 algo..
     * @param {String} key1 Tams Key 1
     * @param {String} dataEncoding format of the data e.g hex | utf8 | binary e.t.c
     * @param {String} key0 tams key 0 
     * @param {String} terminalId 
     * @param {String} masterKey tams Master key
     * @param {String} outputEncoding format of the output e.g hex | utf8 | binary e.t.c
     */
    decryptTamsSessionKeys1(key1,dataEncoding,key0,terminalId,masterKey,outputEncoding){
        while(terminalId.length < 16){
            terminalId = "0" + terminalId;
        }

        let key = masterKey + (Buffer.from(terminalId,'utf8')).toString('hex');

        let k = Buffer.from(key,'hex');
        let decipher = crypto.createDecipheriv('rc4',k,new Buffer.alloc(0));
        decipher.setAutoPadding(false);

        decipher.update(key0,dataEncoding,outputEncoding);

        let decryptedData = decipher.update(key1, dataEncoding,outputEncoding);
        decryptedData += decipher.final(outputEncoding);
        return decryptedData;
    },
    
    /**
     * decrypt session key 2 with RC4 algo..
     * @param {String} key2 tams key 2
     * @param {String} key1 Tams Key 1
     * @param {String} dataEncoding format of the data e.g hex | utf8 | binary e.t.c
     * @param {String} key0 tams key 0 
     * @param {String} terminalId 
     * @param {String} masterKey tams Master key
     * @param {String} outputEncoding format of the output e.g hex | utf8 | binary e.t.c
     */
    decryptTamsSessionKeys2(key2,key1,dataEncoding,key0,terminalId,masterKey,outputEncoding){
        while(terminalId.length < 16){
            terminalId = "0" + terminalId;
        }

        let key = masterKey + (Buffer.from(terminalId,'utf8')).toString('hex');

        let k = Buffer.from(key,'hex');
        let decipher = crypto.createDecipheriv('rc4',k,new Buffer.alloc(0));
        decipher.setAutoPadding(false);

        decipher.update(key0,dataEncoding,outputEncoding);
        decipher.update(key1,dataEncoding,outputEncoding);

        let decryptedData = decipher.update(key2, dataEncoding,outputEncoding);
        decryptedData += decipher.final(outputEncoding);
        return decryptedData;
    },

    /**
     * decrypt data with 3DES
     * @param {String} data data to decrypt
     * @param {String} dataEncoding format of the data e.g hex | utf8 | binary e.t.c
     * @param {String} key key to decrypt the data
     * @param {String} keyEncoding format of the key e.g hex | utf8 | binary e.t.c
     * @param {*} outputEncoding format of the result e.g hex | utf8 | binary e.t.c
     */
    
     decrypt3DES(data,dataEncoding,key,keyEncoding,outputEncoding){
        let d = Buffer.from(data,dataEncoding);
        let k = Buffer.from(key,keyEncoding)
        let decipher = crypto.createDecipheriv('des-ede',k,new Buffer.alloc(0));
        decipher.setAutoPadding(false);
        let decryptedData = decipher.update(data, dataEncoding,outputEncoding);
        decryptedData += decipher.final(outputEncoding);
        return decryptedData.toUpperCase();
    },

    /**
     * encrypt data with 3DES
     * @param {String} data data to encrypt
     * @param {String} dataEncoding format of the data e.g hex | utf8 | binary e.t.c
     * @param {String} key key to encrypt the data
     * @param {String} keyEncoding format of the key e.g hex | utf8 | binary e.t.c
     * @param {*} outputEncoding format of the result e.g hex | utf8 | binary e.t.c
     */
    encrypt3DES(data,dataEncoding,key,keyEncoding,outputEncoding){
        let d = Buffer.from(data,dataEncoding);
        let k = Buffer.from(key,keyEncoding)
        let cipher = crypto.createCipheriv('des-ede',k,new Buffer.alloc(0));
        cipher.setAutoPadding(false);
        let encryptedData = cipher.update(data, dataEncoding,outputEncoding);
        encryptedData += cipher.final(outputEncoding);
        return encryptedData.toUpperCase();
    },

    encryptRC4(data,dataEncoding,key,keyEncoding,outputEncoding){
        let d = Buffer.from(data,dataEncoding);
        let k = Buffer.from(key,keyEncoding)
        let cipher = crypto.createCipheriv('rc4',k,new Buffer.alloc(0));
        cipher.setAutoPadding(false);
        let encryptedData = cipher.update(data, dataEncoding,outputEncoding);
        encryptedData += cipher.final(outputEncoding);
        return encryptedData.toUpperCase();
    },

    encryptAES(data,key, keyEncoding,outputEncoding="base64"){
        let d = Buffer.from(data,"utf-8");
        let k = Buffer.from(key,keyEncoding);

        let iv = Buffer.from(crypto.randomBytes(16))
        let cipher = crypto.createCipheriv('aes-128-ecb',k,"");
        cipher.setAutoPadding(true);
        let encryptedData = cipher.update(d,'utf-8',outputEncoding);
        encryptedData+= cipher.final(outputEncoding);
        return encryptedData;
    },

    /**
     * extract pinblock from unpacked message
     * @param {Object} unpackedMessage unpacked message from POSs
     */
    getPinBLock(unpackedMessage){
        return unpackedMessage.dataElements[52];
    },

    /**
     * get the length of the iso message in binary
     * @param {Number} length length of the data in decimal
     * @returns {Binary} length in binary
     */
    getLengthBinary(length){
        let d = length & 0xFF;
        let c = length >> 8;
        return String.fromCharCode(c) + String.fromCharCode(d);
    },

    getLengthBytes(length){
        // console.log("length "+length.toString());
        let d = length & 0xFF;
        // console.log(d);
        let c = length >> 8;
        return Buffer.from([c,d],'binary');
    },

    isPayattitudeRequest(unpackedMessage) {

        return (unpackedMessage["59"] !== null && unpackedMessage["59"].split("~")[0].toLowerCase() === process.env.UPSL_PATTITUDE_IDENTIFIER)

    },


    hasNibss1OfflineKeys(Terminal){
        if(Terminal)
        {
            if(Terminal.masterKey_1 && Terminal.sessionKey_1)
            {
                return true;
            }
            return false;
        }
        return false;
    },

    hasNibss1OnlineKeys(Terminal){
        if(Terminal)
        {
            if(Terminal.masterKey_1 && Terminal.sessionKey_1 && Terminal.pinKey_1)
            {
                return true;
            }
            return false;
        }
        return false;
    },

    canDoNibss2Online(Terminal){
        if(Terminal)
        {
            if(Terminal.masterKey_2 && Terminal.sessionKey_2 && Terminal.pinKey_2)
            {
                return true;
            }
            return false;
        }
        return false;
    },

    canDoNibss2Offline(Terminal){
        if(Terminal)
        {
            if(Terminal.masterKey_2 && Terminal.sessionKey_2)
            {
                return true;
            }
            return false;
        }
        return false;
    },

    checkIfVirtualTidAndNoVasData(unpackedMessage, vasData) {

        const terminalId = unpackedMessage.dataElements[41];

        return process.env.virtualTids.split(',').includes(terminalId) && vasData === null;
        
    },


    canDoTamsFallover(Terminal,config){
        if(Terminal)
        {
            let hasConfig = false;
            if(config)
            {
                if(config.useTams)
                {
                    hasConfig = true;
                    if(config.tams){
                        if(config.tams.TAMS_DIRECT == false){
                            return true;
                        }
                    }
                }
            }
                

            if(Terminal.masterKey_tams && Terminal.sessionKey_tams1 && Terminal.sessionKey_tams2 && Terminal.sessionKey_tams0 && hasConfig)
            {
                return true;
            }
            return false;
        }
        return false;
    },

    /**
     * get transation type from iso message and map to tams message type
     * @param {Object} unpackedMessage unpacked iso message
     */
    getTamsTransactionType(unpackedMessage){
        let processingCode = this.getProcessingCode(unpackedMessage)
        let tamsTransType = TransTypes.find(c=>c.nibss == processingCode);
        return tamsTransType.tams; 
    },


    /**
     * convert iso icc data to tams format
     * @param {Object} unpackedMessage unpacked iso message from pos
     * @returns {String} formatted iccdata for tams
     */
    mapICCData(unpackedMessage,sequenceNumber){
        let nibssICC = unpackedMessage.dataElements[55];

        let iccDataList  = new Map();
        let skip = 0;
        while(skip < nibssICC.length)
        {
            let tag = {};
            tag =  TlvTags.find(c=>c.tag  == nibssICC.substr(skip,2));
            if(tag)
            {
                skip= skip + 2;
            }
            else{
                tag = TlvTags.find(c=>c.tag  == nibssICC.substr(skip,4));
                skip= skip + 4;
            }
            
            let length = nibssICC.substr(skip,2);
            length  = (Number.parseInt(length,16)) * 2;
            skip= skip + 2;
            let data = nibssICC.substr(skip,length);
            // console.log(`tag: ${tag.tag}, data: ${data}`);
            skip= skip + length;
            iccDataList.set(tag.tag , data);
        }

        let mappedData = ``;

            if(iccDataList.get("9F26"))
                mappedData+= iccDataList.get("9F26") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F27"))
                mappedData+= iccDataList.get("9F27") + '|';
            else
                mappedData+= '|';
                
            if(iccDataList.get("9F10"))
                mappedData+= iccDataList.get("9F10") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F37"))
                mappedData+= iccDataList.get("9F37") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F36"))
                mappedData+= iccDataList.get("9F36") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("95"))
                mappedData+= iccDataList.get("95") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9A"))
                mappedData+= iccDataList.get("9A") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9C"))
                mappedData+= iccDataList.get("9C") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F02"))
                mappedData+= iccDataList.get("9F02") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F1A"))
                mappedData+= iccDataList.get("9F1A") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("5F34"))
                mappedData+= iccDataList.get("5F34") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("82"))
                mappedData+= iccDataList.get("82") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F2A"))
                mappedData+= iccDataList.get("9F2A") + '|';
            else
                mappedData+= iccDataList.get("9F1A") + '|';

            // for amountOther
            if(iccDataList.get('9F03'))
                mappedData+= iccDataList.get('9F03') + '|';
            else
                mappedData += "000000000000|";

            if(iccDataList.get("9F33"))
                mappedData+= iccDataList.get("9F33") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get('84'))
                mappedData+= iccDataList.get('84') + '|';
            else
                mappedData += "|";

            if(iccDataList.get("9F08"))
                mappedData+= iccDataList.get("9F08") + '|';
            else
                mappedData+= '0002|';

            if(iccDataList.get("9F34"))
                mappedData+= iccDataList.get("9F34") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F35"))
                mappedData+= iccDataList.get("9F35") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F1E"))
                mappedData+= iccDataList.get("9F1E") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F53"))
                mappedData+= iccDataList.get("9F53") + '|';
            else
                mappedData+= '52|';

            if(iccDataList.get("84"))
                mappedData+= iccDataList.get("84") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F09"))
                mappedData+= iccDataList.get("9F09") + '|';
            else
                mappedData+= '|';

            if(iccDataList.get("9F41"))
                mappedData+= iccDataList.get("9F41") + '|';
            else {
                while (sequenceNumber.length < 8)
                    sequenceNumber = '0' + sequenceNumber;

                mappedData += sequenceNumber + '|';
            }

            if(iccDataList.get("9F34"))
                mappedData+= iccDataList.get("9F34") + '|';
            else
                mappedData+= '|';

        // console.log(mappedData); 

        return mappedData;
        
    },

    /**
     * read throught the iccdata string, compare tag with the one in config,
     *  read length convert to int , divide by 2 and use the length to read
     *  the tag data. 
     * @param {Object} unpackedMessage unpackmessage object from POS or HOST
     */
    getICCData(unpackedMessage) {
        let nibssICC = unpackedMessage.dataElements[55];
        if(nibssICC){
            return this.parseTlv(nibssICC);
        }
        // if (nibssICC) {
        //     let iccDataList = new Map();
        //     let skip = 0;
        //     while (skip < nibssICC.length) {
        //         let tag = {};
        //         tag = TlvTags.find(c => c.tag == nibssICC.substr(skip, 2));
        //         console.log('tag', tag);
        //         if (tag) {
        //             skip = skip + 2;
        //             console.log('tag at SKip + 2',tag)
        //             // console.log('got to IF Block -- SKIP value', skip)
        //         } else {
        //             tag = TlvTags.find(c => c.tag == nibssICC.substr(skip, 4));
        //             skip = skip + 4;
        //             // console.log('got to else Block -- SKIP value', skip)
        //             console.log('tag at SKip + 4',tag)
        //         }
        //         // console.log('skip outside if-else bLOCK', skip);
        //         let length = nibssICC.substr(skip, 2);
        //         length = (Number.parseInt(length, 16)) * 2;
        //         skip = skip + 2;
        //         // console.log('skip After ADding 2 below Block', skip);
        //         let data = nibssICC.substr(skip, length);
        //         console.log(`CHecking .....tag: ${tag.tag}, data: ${data}`);
        //         skip = skip + length;
        //         iccDataList.set(tag.tag, data);
        //     }

        //     return iccDataList;
        // }
        return false;
    },


    /**
     * 
     * @param {*} buff 
     * @returns 
     */
    parseTlv(buff) {
        let hexBuff = this._splitHexBuff(buff)
        let tlv = new Map();
        while (hexBuff.length) {
            let pair = this._getNextTag(hexBuff)
            tlv.set(pair[0], pair[1])
        }
        return tlv;
    },

    /**
     * 
     * @param {*} hexBuff 
     * @returns 
     */
    _getNextTag(hexBuff) {
        let tag = this._getNextByte(hexBuff);
        let nextByte;
        if ((parseInt(tag, 16) & 0x1F) == 0x1F) {
            do {
                nextByte = this._getNextByte(hexBuff)
                tag += nextByte
            } while (parseInt(nextByte, 16) & 0x80)
        }


        let length = parseInt(this._getNextByte(hexBuff), 16)
        if (length & 0x80) {
            let lengthNumOfBytes = length & 0x7F;
            length = 0
            while (lengthNumOfBytes--) {
                let nextByte = parseInt(this._getNextByte(hexBuff), 16)
                length <<= 8
                length += nextByte
            }
        }
    
        let value = ""
        while (length--) {
            value += this._getNextByte(hexBuff)
        }
        return [tag, value]
    },

     /**
     * 
     * @param {*} buff 
     * @returns 
     */
      _splitHexBuff(buff) {
        if (buff.length % 2)
            throw new Error("Invalid hexadecimal buffer")
        if (buff.match(/[^0-9A-F]/i))
            throw new Error("Invalid hexadecimal buffer")
        return buff.match(/.{1,2}/g);
    },
    
    /**
     * 
     * @param {*} hexBuff 
     * @returns 
     */
    _getNextByte(hexBuff) {
        if (hexBuff.length === 0)
            throw new Error("Invalid TLV");
        return hexBuff.shift()
    },

    /**
     * convert mapped TLV tags to structure Icc data
     * @param {Map} tagsMap map of TLV tags
     * @returns {String}
     */
    buildIccData(tagsMap){
        let iccData = '';
        tagsMap.forEach((data, tag)=>{
            iccData += tag;
            let dataLength = data.length;
            dataLength= dataLength/2;
            let hexLen = dataLength.toString(16);
            console.log(hexLen);
            iccData+= this.padLeft(hexLen,"0",2) + data;
        });
        return iccData.toUpperCase();
    },


    /**
     * map response code from nibss to it's message
     * @param {String} code response code from nibss
     */
    getNibssResponseMessageFromCode(code) {
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
    },

    getFromAccount(processCode){
        let code = processCode.substr(2,2);
        if(code == "00"){
            return "Default";
        }else if(code == "01"){
            return "Savings";
        }else if(code == "02"){
            return "Current";
        }else{
            return "Unknown Account Type";
        }
    },

    /**
     * map tams response code to it's nibss equivalent
     * @param {String} resCode response code from tams after failover
     */
    mapTamsResToNibss(resCode){
        let response = ResponseMap.find(c=>c.tams == resCode);
        if(response)
        {
            return response.nibss;
        }
        return '06';
    },

    getDukptPinblock(pinBLock,ksn,config){
       let options = {
            inputEncoding: 'hex',
            outputEncoding: 'hex',
            encryptionMode: '3DES',
            trimOutput: true
        };

        let bdk = this.xorHexString(config.tams.COM_KEY_1,config.tams.COM_KEY_2).toString('hex');
        const dukpt = new Dukpt(bdk,ksn);
        console.log(`ksn ${ksn}`)
        console.log(`ksn ${bdk}`)
        console.log(`ksn ${dukpt._sessionKey}`)
        console.log(`pinpblock ${pinBLock}`)
        const encryptedData = dukpt.dukptEncrypt(pinBLock, options);
        console.log(`encrypt ${encryptedData}`)
        return encryptedData;
    },

    /**
     * 
     * @param {String} data data to encrypt
     * @param {String} ksn key sequence number
     * @param {String} bdk google it...lolz
     */
    getDukptEncrypt(data,ksn,bdk){
       let options = {
            inputEncoding: 'hex',
            outputEncoding: 'hex',
            encryptionMode: '3DES',
            trimOutput: true
        };

        const dukpt = new Dukpt(bdk,ksn);
        const encryptedData = dukpt.dukptEncrypt(data, options);
        return encryptedData;
    },

    getTamsConfig(terminalId){
        return TamsConfigs.find(c=>c.selector == terminalId.substr(0,4));
    },

    padLeft(data,padChar,length){
        let result = data
        while(result.length < length)
        {
            result = padChar + result;
        }
        return result;
    },

    padRight(data,padChar,length){
        let result = data
        while(result.length < length)
        {
            result+= padChar;
        }
        return result;
    },

    getReversalField90(unpackedMessage){
        let originalSN = unpackedMessage.dataElements[37].substr(6);
        let transDateandTime = unpackedMessage.dataElements[7];
        let acqCode = this.padLeft(unpackedMessage.dataElements[35].substr(0,6),"0",11);
        let originalForwardingInstCode = this.padLeft(unpackedMessage.dataElements[32],'0',11);
        let value = '0200'  + originalSN + transDateandTime + acqCode + originalForwardingInstCode;
        // console.log(value);
        return value;
    },

    getIMEI(unpackedMessage){
        return unpackedMessage.dataElements[62];
    },

    // get forwarding institutional identification code
    getFIIC(unpackedMessage){
        return unpackedMessage.dataElements[33] || null;
    },

    /**
     * build config data from nibss response
     * @param {Object} unpackedMessage response from nibss
     * @returns {Map} config data;
     */
    getConfigData(unpackedMessage){
        let data = unpackedMessage.dataElements[62];
        let config = new Map();

        this.configDataTags.forEach(cc =>{
            let res = this.getDownloadParamData(cc,data);
            console.log(res);
            config.set(cc,res);
        });
        return config;
    },

    /*
    *extract get parameter data from nibss response
    */
    getDownloadParamData(code, mainString) {
         data = "";
         lengthOfTag = 2;

        indexOfMgtCodeInMainString = mainString.indexOf(code);

        if (indexOfMgtCodeInMainString < 0)
            return "";

        dataLenString = code.substr(lengthOfTag);

        dataLength = parseInt(dataLenString);

        indexOfMgtData = indexOfMgtCodeInMainString + code.length;

        data = mainString.substr(indexOfMgtData, indexOfMgtData + dataLength);

        return data || '';
    },

    /**
     * Parse TLV data from callhome data field 62
     * @param {String} data field 62 of the call home request data  
     * */
    parseCallHomeTlvData(data){
        try{
            let response = {};

            let skip = 0;

            while(skip  < data.length)
            {
                let tag = data.substr(skip, 2)
                skip+=2;

                let lengthOfTagMsgString = data.substr(skip, 3)
                skip+=3;
                let msgLen = Number.parseInt(lengthOfTagMsgString);
                

                let tagValue = data.substr(skip, msgLen);
                
                response[tag] = tagValue;
                skip+=msgLen;
            }
            return response;
        }
        catch(e){return null}
    },

    getShortDate(){
        let date = new Date();
        let year = date.getFullYear().toString().substr(date.getFullYear().toString().length-2);
        let month = this.padLeft((date.getMonth()+1).toString(),"0",2);
        let day = this.padLeft(date.getDate().toString(),"0",2);

        return year + month + day;
    },

    // returns Customer Id in D59
    isNeolifePOS(unpackedMessage)
    {
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(neolifeConfig.identifier))
            return false;

        return customdata.split("~")[1];
    },

    truncateData(data){
        let result = '';
        if(data.substr(2,2)=='08')
        {
            result = data.substr(0,25);
        }
        else{
            result = data.substr(0,40);
        }
        return Buffer.from(result).toString('hex')+'.....';
    },

    
    getCustomerRefData(unpackedMessage)
    {
        return unpackedMessage.dataElements[59] || null;
    },

    getAmount(unpackedMessage){
        return unpackedMessage.dataElements[4];
    },

    getMaskPan(unpackedMessage){
        return unpackedMessage.dataElements[2].substr(0, 6) + ''.padEnd(unpackedMessage.dataElements[2].length - 10, 'X') + unpackedMessage.dataElements[2].slice(-4)
    },

    /**
     * get the processor RRN
     */
    getUsedRRN(journal){
        if (journal.handlerUsed == this.handlers.nibss1) {

            return journal.rrn;

        } else if (journal.handlerUsed == this.handlers.nibss2) {

            return journal.failOverRrn || journal.rrn;

        } else if (journal.handlerUsed == this.handlers.tams) {

            return journal.tamsRRN || journal.failOverRrn || journal.rrn;

        } else {

            return journal.rrn;

        }
    },



    getTransmissionDateandTime(){
        let date = new Date();
        let result = this.padLeft((date.getMonth()+1).toString(),'0',2) + this.padLeft(date.getDate().toString(),'0',2) + this.padLeft(date.getHours().toString(),'0',2) + this.padLeft(date.getMinutes().toString(),'0',2) + this.padLeft(date.getSeconds().toString(),'0',2);
        // console.log(result);
        return result;
    },

    /**
     * map icc data from POS to XML
     * @param {Object} unpackedMessage unpacked message from POS
     * @returns {String} xml string of the iccdata
     */
    mapICCDataToXML(unpackedMessage)
    {
        let iccdata = this.getICCData(unpackedMessage);

        if(!iccdata)
            return false;
    
        let options = {
            compact: true,
            ignoreComment: true
        };

        let data = {
            IccData: {
                IccRequest: {
                    AmountAuthorized : iccdata.get('9F02'),
                    ApplicationInterchangeProfile : iccdata.get('82'),
                    ApplicationTransactionCounter : iccdata.get('9F36'),
                    Cryptogram : iccdata.get('9F26'),
                    CryptogramInformationData : iccdata.get('9F27'),
                    CvmResults : iccdata.get('9F34'),
                    InterfaceDeviceSerialNumber : iccdata.get('9F1E'),
                    IssuerApplicationData : iccdata.get('9F10'),
                    TerminalCapabilities : iccdata.get('9F33'),
                    TerminalCountryCode : this.removeLeftPad(iccdata.get('9F1A'),3),
                    TerminalType : iccdata.get('9F35'),
                    TerminalVerificationResult : iccdata.get('95') || '0000008000',
                    // TerminalVerificationResult : '0000008000',
                    TerminalApplicationVersionNumber : iccdata.get('9F09'),
                    TransactionCurrencyCode : this.removeLeftPad(iccdata.get('5F2A'),3),
                    TransactionDate : iccdata.get('9A'),
                    TransactionType : iccdata.get('9C'),
                    UnpredictableNumber : iccdata.get('9F37')
                }
            }
        };

        let result = Xml2js.json2xml(JSON.stringify(data), options);
        return `<?xml version="1.0" encoding="UTF-8"?>${result}`;
    },

    prepareStruturalData(data){
        let result = '';
        data.forEach(e=>{
            let dataLen = e.length.toString();
            let lengthLen = dataLen.length;
            result+=`${lengthLen}${dataLen}${e}`;
        });
        return result;
    },

    /**
     * convert xml string response from interswitch to  nibss format to return in response to POS
     * @param {String} xmlIccData xml data string (field 127.25 from interswitch response)
     */
    mapInterswitchICCresponseToNibbs(xmlIccData){
        if(xmlIccData == null || xmlIccData == undefined)
            return false;
        
        let jsonData = this.convertXMLtoJSON(xmlIccData);
        let data = JSON.parse(jsonData);
        console.log(JSON.stringify(data));

        if(data["IccData"])
        {
            if(data["IccData"]["IccResponse"])
            {
                let IccResponse = data["IccData"]["IccResponse"];
                let mappedTag = new Map();

                if(IccResponse.ApplicationTransactionCounter)
                    mappedTag.set("9F36",IccResponse.ApplicationTransactionCounter._text);
                if(IccResponse.IssuerAuthenticationData)
                    mappedTag.set("91",IccResponse.IssuerAuthenticationData._text);
                if(IccResponse.IssuerScriptTemplate2)
                    mappedTag.set("71",IccResponse.IssuerScriptTemplate2._text);

                if(mappedTag.size <= 0)
                {
                    return false;
                }

                return this.buildIccData(mappedTag);
        
            }
        }
        return false;

    },


    hmacsha256(data, secret) {

        let sha256 = cryptojs.HmacSHA256(data, secret);
        let base64encoded = cryptojs.enc.Base64.stringify(sha256);
        return base64encoded;
    },

    convertXMLtoJSON(xml) {
        let complete_xml = xml;
        let json = Xml2js.xml2json(complete_xml, {
            compact: true,
            spaces: 4
        });
        return json;
    },

    isFailoverResponse(resCode, responses = []){
        if(resCode == null || resCode == undefined)
            return false;
        return responses.includes(resCode) || this.failoverResponses.includes(resCode);
    },

    removeLeftPad(data,len){
        return data.substr(data.length-len);
    },

    getAmount(unpackedMessage){
        return parseInt(unpackedMessage.dataElements[4]);
    },

    // returns Customer data in D59
    isFRSCPOS(unpackedMessage)
    {
        let identifier = process.env.frsc_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },
    // returns Customer data in D59
    isSTERLINGPOS(unpackedMessage)
    {
        let identifier = process.env.frsc_str_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isIGRPOS(unpackedMessage)
    {
        let identifier = process.env.igr_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isHAPAGPOS(unpackedMessage)
    {
        let identifier = process.env.hap_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isJAMBPRCPOS(unpackedMessage)
    {
        let identifier = process.env.jambprc_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isRemitaPOS(unpackedMessage)
    {
        let identifier = process.env.remita_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isFlutterPOS(unpackedMessage)
    {
        let identifier_flutter = process.env.flutter_identifer;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        return customdata.startsWith(identifier_flutter) || customdata.startsWith(identifier_flutter.toUpperCase());
    },

    isIGRParkwayPOS(unpackedMessage)
    {
        let identifier_zenith = process.env.igr_parkway_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;

        return customdata.startsWith(identifier_zenith);
    },

    isIGRZParkwayPOS(unpackedMessage)
    {
        let identifier_zenith = process.env.igr_parkway_zenith_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;

        return customdata.startsWith(identifier_zenith);
    },
    
    isC24POS(unpackedMessage)
    {
        let identifier = process.env.c24_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.toLowerCase().startsWith(identifier))
            return false;

        return customdata.toLowerCase().startsWith(identifier);
    },

    isMikroPOS(unpackedMessage)
    {
        let identifier = process.env.mikr_identifier;
        let identifier_2 = process.env.mikro_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!(customdata.toLowerCase().startsWith(identifier) || customdata.toLowerCase().startsWith(identifier_2)))
            return false;

        return customdata.toLowerCase().startsWith(identifier) || customdata.toLowerCase().startsWith(identifier_2);
    },

    isArteziaPOS(unpackedMessage)
    {
        let identifier = process.env.artezia_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata.startsWith(identifier);
    },

    isElnexuPOS(unpackedMessage)
    {
        let identifier = process.env.elnexu_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata.startsWith(identifier);
    },

    isRemitaCollectPOS(unpackedMessage)
    {
        let identifier = process.env.remita_collect_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isStanbicDstvPOS(unpackedMessage)
    {
        let identifier = process.env.stanbic_dstv_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isWemaCollectPOS(unpackedMessage)
    {
        let identifier = process.env.wema_collect_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    isRSUTHPOS(unpackedMessage)
    {
        let identifier = process.env.rsuth_identifier;
        let customdata = unpackedMessage.dataElements[59] || null;
        if(customdata == null)
            return false;
        if(!customdata.startsWith(identifier))
            return false;

        return customdata;
    },

    mapUPTerminalsWithMIDs(upTerminalId) {

        if(upTerminalId == "2UP1T008") {
            return "2UP1LA000008ITX"
        } else if (upTerminalId == "2UP1T009") {
            return "2UP1LA000009ITX"
        } else if (upTerminalId == "2UP1T010") {
            return "2UP1LA000010ITX"
        } else if(upTerminalId == "2UP1T011") {
            return "2UP1LA000011ITX"
        } else if(upTerminalId == "2UP1T012") {
            return "2UP1LA000012ITX"
        } else if(upTerminalId == "2UP1T013") {
            return "2UP1LA000013ITX"
        } else if(upTerminalId == "2UP1T007") {
            return "2UP1LA000007ITX"
        } else {
            return false;
        }




    },



    mapBankTerminalIdsToUPForWithdrawal(terminalId) {

        const upTerminalIds = process.env.UPSL_WITHDRAWAL_TERMINAL_IDS.split(',');

        let bankfromTID = terminalId.substr(0,4);

       // return process.env.UPSL_WITHDRAWAL_TERMINAL_IDS.split(',')[0];


        // // For QA Tests
        // if (terminalId == "20578628") {

        //      return upTerminalIds[0];

        // } else if (terminalId == "2058LS73") {

        //      return upTerminalIds[1];

        // } else if (terminalId == "2033GP24") {

        //      return upTerminalIds[2];

        // } else if (terminalId == "2070HE88") {

        //      return upTerminalIds[3];

        // } else if (terminalId == "2101JA26") {

        //      return upTerminalIds[4];

        // } else if (terminalId == "2101JA24") {

        //      return upTerminalIds[5];

        // } else {

        //     return upTerminalIds[6];

        // }


        // For Production
        //Access Bank and Eco Bank
        if(["2044","2063", "2050","2056"].includes(bankfromTID)) {

            return upTerminalIds[0];

        // Fidelity and First Bank
        } else if(["2070","2011","2071","2701"].includes(bankfromTID)) {

            return upTerminalIds[1];

        // FCMB and Heritage Bank
        } else if(["2214","2085","2030","2084"].includes(bankfromTID)) {

            return upTerminalIds[2];

        // Keystone, Skye, Union and Stanbic Bank
        }  else if(["2082","2076","2039","2032"].includes(bankfromTID)) {

            return upTerminalIds[3];

        // UBA, Wema, Zenith and Sterling 
        } else if(["2033","2035","2057","2232"].includes(bankfromTID)) {

            return upTerminalIds[4];
        
        // Gtbank and Unity
        } else if(["2058","2215"].includes(bankfromTID)) {

            return upTerminalIds[5];

        // Providus and Others
        } else {

            return upTerminalIds[6]

        }



    },


    bankfromTID(terminalId,getCode=false){
        if(!terminalId) return false;
        
        let term = terminalId.substr(0,4);
        if(["2044","2063"].includes(term)){
            if(getCode)return "ACCESS";
            return "ACCESS BANK";
        }
        else if(["2050","2056"].includes(term))
        {
            if(getCode)return "ECO";
            return "ECO BANK";
        }
        else if(["2070"].includes(term))
        {
            if(getCode)return "FIDELITY";
            return "FIDELITY BANK";
        }
        else if(["2011","2071","2701"].includes(term))
        {
            if(getCode)return "FIRST";
            return "FIRST BANK";
        }
        else if(["2214","2085"].includes(term))
        {
            if(getCode) return "FCMB";
            return "FCMB BANK";
        }
        else if(["2030","2084"].includes(term))
        {
            if(getCode)return "HERITAGE";
            return "HERITAGE BANK";
        }
        else if(["2082"].includes(term))
        {
            if(getCode)return "KEYSTONE";
            return "KEYSTONE BANK";
        }
        else if(["2076"].includes(term))
        {
            if(getCode)return "SKYE";
            return "SKYE BANK";
        }
        else if(["2039"].includes(term))
        {
            if(getCode)return "STANBIC";
            return "STANBIC IBTC BANK";
        }
        else if(["2032"].includes(term))
        {
            if(getCode)return "UNION";
            return "UNION BANK";
        }
        else if(["2033"].includes(term))
        {
            if(getCode)return "UBA";
            return "UBA BANK";
        }
        else if(["2035"].includes(term))
        {
            if(getCode)return "WEMA";
            return "WEMA BANK";
        }
        else if(["2057"].includes(term))
        {
            if(getCode)return "ZENITH";
            return "ZENITH BANK";
        }
        else if(["2232"].includes(term))
        {
            if(getCode)return "STERLING";
            return "STERLING BANK";
        }
        else if(["2058"].includes(term))
        {
            if(getCode)return "GTBANK";
            return "GTBANK";
        }
        else if(["2215"].includes(term))
        {
            if(getCode)return "UNITY";
            return "UNITY BANK";
        }
        else if(["2101"].includes(term))
        {
            if(getCode)return "PROVIDUS";
            return "PROVIDUS BANK";
        }
        else if(["2100"].includes(term))
        {
            if(getCode)return "SUNTRUST";
            return "SUNTRUST BANK";
        } 
        else if(["2102"].includes(term))
        {
            if(getCode)return "TITAN";
            return "TITAN BANK";
        }
        else if(["2103"].includes(term))
        {
            if(getCode)return "GLOBUS";
            return "GLOBUS BANK";
        }
        else if(["2104"].includes(term))
        {
            if(getCode)return "PARALLEX";
            return "PARALLEX BANK";
        }
        else if(["2301"].includes(term))
        {
            if(getCode)return "JAIZ";
            return "JAIZ BANK";
        }
        else if(["2303"].includes(term))
        {
            if(getCode)return "LOTUS";
            return "LOTUS BANK";
        }
        else if(["2302"].includes(term))
        {
            if(getCode)return "TAJ";
            return "TAJ BANK";
        }
        else if(["2076"].includes(term))
        {
            if(getCode)return "POLARIS";
            return "POLARIS BANK";
        }
        else{
            return "UNKNOWN";
        }
    },

    /**
     * Check if TID for Remita is UBA TID
     * @param {*} terminalId 
     * @returns Boolean (True if it is UBA TID and False if not UBA TID)
     */
    isSpecialUbaTID(terminalId) {
        if(!terminalId) return false;
        if (terminalId === "2033LRC1") {
            return true;
        }
        return false;
    },

    /**
     * get D59 value then split with ~ (which is used as seperator) then return [0]
     * @param {*} unpackedMessage unpacked request from POS
     */
    extractIdentifier(customdata){
        if(!customdata) return null;
        let identifier = customdata.split('~');
        // || customdata.split('|') identifier[0].substr(3, 24).trim();
        return identifier[0] || null;
    },

    getTransactionAmount(unpackedMessage) {

        return parseInt(unpackedMessage.dataElements[4]);

    },

    /**
     * 
     * @param {*} pan 
     * @returns {*} string - VISA | VERVE | AMERICAN-EXPRESS | MASTERCARD | PAYATTITUDE | JCB | CARD
     */
    getCardType(pan){

        if(pan === process.env.UPSL_PAYATTITUDE_STATIC_PAN) return "PAYATTITUDE";
        let check = pan.substr(0,2);
        if(pan.startsWith("4")) return "VISA";
        else if(["51","52","53","54","55"].includes(check) || pan.startsWith("2")) return "MASTERCARD";
        else if(["50","65"].includes(check)) return "VERVE";
        else if(["34","37"].includes(check)) return "AMERICAN-EXPRESS";
        else if(pan.startsWith("3528") || pan.startsWith("3589")) return "JCB";
        else return "CARD";
    },
    
    getTerminalForIsoLogs(terminalId) {
        if (process.env.ISO_TERMINALS_TO_LOG.split(",").includes(terminalId)) return true;
        else return false;
    },

    getTerminalForLog(unpackedMessage){
        let terminal = this.getTerminalId(unpackedMessage);
        if(terminal) return terminal;
        return 'unknown';
    },

    /**
     * 
     * @param {*} unpackedMessage 
     * @param {String} iso iso string
     */
    fileIsoLogger(unpackedMessage,iso){
        let enable = process.env.file_log;
        if(enable != "true")return;

        let filesPath = path.join(`mw-logs/${moment().format("YYYY-MM-DD")}`,this.getTerminalId(unpackedMessage)+`-iso-logfile.log`);
        let pathDir = path.dirname(filesPath);
        if (fs.existsSync(pathDir) == false) {
            fs.mkdirSync(pathDir)
        }

        let logger = SimpleNodeLogger.createSimpleLogger({
            logFilePath: filesPath,
            timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
        });
        //Edited 0420 from here
        // if(["0200","0420"].includes(unpackedMessage.mti)){
        //     iso  = this.maskAtIndex(iso,44,6);
        //     iso  = this.maskAtIndex(iso,139,35);
        //     if(unpackedMessage[52])
        //         iso  = this.maskAtIndex(iso,256,15);
        //     iso  = this.maskAtIndex(iso,275,289);
        //     logger.log('info',iso);
        // }
        // //Edited 0430 from here
        // else if(["0210","0430"].includes(unpackedMessage.mti)){
        //     iso  = this.maskAtIndex(iso,44,6);
        //     iso  = this.maskAtIndex(iso,139,35);
        //     logger.log('info',iso);
        // }
        // else{
            logger.log('info',iso);
            logger.log('info',JSON.stringify(unpackedMessage.dataElements));
        // }
    },
    /**
     * 
     * @param {string} terminalId 
     * @param {String} msg iso string
     */
    fileDataLogger(terminalId,msg){
        let enable = process.env.file_log;
        if(enable != "true")return;
        
        let filesPath = path.join(`mw-logs/${moment().format("YYYY-MM-DD")}`, terminalId+`-logfile.log`);
        let pathDir = path.dirname(filesPath);
        if (fs.existsSync(pathDir) == false) {
            fs.mkdirSync(pathDir)
        }

        let logger = SimpleNodeLogger.createSimpleLogger({
            logFilePath: filesPath,
            timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
        });

        logger.log('info',msg);
    },

    /**
     * 
     * @param {string} unpackedMessage 
     * @param {String} iso iso string
     */
     failedDbLogs(msg){
        let enable = process.env.file_log;
        if(enable != "true")return;
        
        let filesPath = path.join(`mw-logs/${moment().format("YYYY-MM-DD")}`, `DB-logfile.log`);
        let pathDir = path.dirname(filesPath);
        if (fs.existsSync(pathDir) == false) {
            fs.mkdirSync(pathDir)
        }

        let logger = SimpleNodeLogger.createSimpleLogger({
            logFilePath: filesPath,
            timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
        });

        logger.log('info',msg);
    },
    /**
     * 
     * @param {String} data 
     * @param {Number} index 
     * @param {Number} length 
     */
    maskAtIndex(data,index,length){
        let masked = '';while(masked.length < length)masked+='X';

        return data.substr(0,index)+ masked +data.substr(index+length);
    },

    getCustomJson(transactionData){
        
        try {
            let customdata = transactionData.customerRef || null;

            if (!customdata) return null;
            let customdatas = customdata.split('~')
            if(customdatas.length <= 0) return null

            let jsonstr = customdatas.pop();

            return JSON.parse(jsonstr)

        } catch (error) {
            return null;
        }

    },

    checkFailoverSelected(config,unpackedMessage){
        if(config.useSelected === true){
            let terminalId = this.getTerminalId(unpackedMessage);
            let merchantId = this.getMerchantId(unpackedMessage);
            // let merchantId = 
            let selecteds = config.selected || [];
            if(!selecteds.includes(terminalId) && !selecteds.includes(merchantId)) return false;
        }
        return true;
    },

    getMerchantId(unpackedMessage){
        return unpackedMessage.dataElements[42];
    },
    
    validateVasRequest(terminalId,vasData){
        this.fileDataLogger(terminalId,`vas data, ${JSON.stringify(vasData)}`);

        if(!vasData.method) return false;

        if(!vasData.terminalId) return false;

        if(!vasData.host){
            return false;
        }

        if(typeof vasData.body != 'object') return false;

        if(typeof vasData.body.pfm != 'object') return false;

        if(typeof vasData.journal != 'object') return false;

        if(typeof vasData.headers != 'object') return false;

        return true;
    },

    validateVAS4Request(terminalId,vasData) {

        this.fileDataLogger(terminalId,`vas 4.0 data, ${JSON.stringify(vasData)}`);

        if(!vasData.method) return false;

        if(!vasData.terminalId) return false;

        if(!vasData.host){
            return false;
        }

        if(typeof vasData.body != 'object') return false;

        if(typeof vasData.headers != 'object') return false;

        if(typeof vasData.card != 'object') return false;

        return true;
        
    },

   vasAuthorizationHeader(data,body) {
    let encDate = data.headers.Date;
    console.log(encDate)

    const organisationCode = data.headers.OrganisationCode;
    console.log(organisationCode)

    const key = process.env.VAS_KEY;
    console.log("key",key)

    const username = data.headers.Username;
    console.log("username",username)

    const utf_data = Buffer.from(JSON.stringify(body), 'utf8').toString('utf8');
    // const utf_data = JSON.stringify(body);
    console.log("stringify-body",utf_data)

    const hashString = cryptojs.SHA512(utf_data).toString();
    // const hashString = this.signSHA512Vas(utf_data);
    console.log("hashstring",hashString);

    const token = Buffer.from(key + username).toString('base64');
    console.log("token",token)

    // const signature = this.doSha256(token,hashString);
    const signature =  cryptojs.HmacSHA256(hashString, token).toString();
    console.log("sign",signature);
    


    const full = `${signature.toLowerCase()}${encDate}${organisationCode}`;
    console.log("full",full);

    const authorization = `${username.toUpperCase()}-${
      Buffer.from(full).toString('base64')}`;
    console.log("auth",authorization)

    let headers = data.headers;
    headers.Authorization = authorization; 

    return headers;
  },

  vasAuthorizationHeaderSimply(data,body) {

    const organisationCode = data.headers.OrganisationCode;

    const key = process.env.VAS_KEY;

    const username = data.headers.Username;

    const token = Buffer.from(key + username+organisationCode).toString('base64');

    const signature = cryptojs.SHA256(token);
    
    const authorization = `${username.toUpperCase()}-${signature}`;

    let headers = data.headers;
    headers.Authorization = authorization; 

    return headers;
  },

  checkUpsl(unpackedMessage) {
      let identifier = process.env.upsl_direct_tag;

      let customdata = unpackedMessage.dataElements[60] || null;
      if (customdata == null)
          return false;
      if (!customdata.startsWith(identifier) || process.env.ALLOW_UPSL != 'y')
          return false;
    
      return customdata;
  },

  checkUpslWithdrawal(unpackedMessage) {
    let identifier = process.env.UPSL_PAYATTITUDE_WITHDRAWAL_IDENTIFER;
    let customdata = unpackedMessage.dataElements[60] || null;
    if (customdata == null) { return false; }
    if (process.env.ALLOW_UPSL != 'y') {
        return false;
    }
    if(customdata.split('~')[customdata.split('~').length - 1] === identifier) { return true };
},


  changeF60ContentForUpsl(unpackedMessage) {
    let identifier = process.env.upsl_direct_tag;
    let customdata = unpackedMessage.dataElements[60] || null;
    if(customdata == null) return null;

    // console.log(customdata.startsWith(identifier))
    // console.log(process.env.ALLOW_UPSL == 'y', 'Check allow UPSL?')
    // console.log(customdata.split("~").length > 1, 'Customdata split length check');

    // check if the data actually matches upsl customization
    if (customdata.startsWith(identifier) && process.env.ALLOW_UPSL == 'y' && customdata.split("~").length > 1) {

        console.log("true - upsl-direct");

        const f60Value = customdata.split("~")[1] !== undefined || customdata.split("~")[1] !== null
            ? customdata.split("~")[1].replace('Acct=1022665017', `Acct=${process.env.UPSL_SETTLEMENT_ACCT}`)
            : customdata;

        return f60Value;
    } else {

        console.log("false - upsl-direct");

        return customdata;

    }


  },

  extractEjournalDatafromTLV(tlvdata) {
      let notificationdata = {};

      if (!ejournalTLVTags[(tlvdata.substring(0, 2))] === undefined) {
          return notificationdata;
      }

      for (let i = 0; i < tlvdata.length; i = next) {
          curtag = tlvdata.substring(i, i + 2);
          if (curtag !== "") {
              tagcount = tlvdata.substring(i + 2, (i + 2 + 2));
              // console.log(tagcount)
              tagvalue = tlvdata.substring((i + 1 + 3), ((i + 1 + 3) + parseInt(tagcount)));
              // console.log(tlvmaps[curtag])
              notificationdata[ejournalTLVTags[curtag]] = tagvalue
              // console.log(tagvalue)
              next = (i + 1 + 3) + parseInt(tagcount);
          }
      }

    // console.log("data extracted for ejournal => ", notificationdata);

    return notificationdata;
  },

  extractCardDatafromTrack2(data) {
    const track2Array = data.trim().split('D').length === 2
        ? dataArray.trim().split('D')
        : dataArray.trim().split('=');
    const expiryDate = track2Array[1].substring(0, 4);
    const restrictionCode = track2Array[1].substring(4, 7);
    const pan = track2Array[0];
    return { expiryDate, restrictionCode, pan };
  },

  formatTimestampForIsoRequest() {
    const date = new Date();
    const month = date.getMonth() + 1;
    const fullDate = [
      date.getHours().toString(), // 0
      date.getDate().toString(), // 1
      month.toString(), // 2
      date.getMinutes().toString(), // 3
      date.getSeconds().toString(), // 4
    ];
    // an array to keep all date parameters (hours. day, month, minutes, seconds)
    const dates = [];
    fullDate.map((i) => {
      if (i.length < 2) {
        i = `0${i}`;
      }
      dates.push(i);
    });
    const timeFormat = `${dates[0]}${dates[3]}${dates[4]}`;
    const dateFormat = `${dates[2]}${dates[1]}`;
    return { timeFormat, dateFormat };
  },

  getDbName(baseName, date = null){
    const currentDate = date ? new Date(date) : new Date();
    // const currentDate = new Date(date) || new Date();
    // const dataInterval = 3
    const currentMonth = currentDate.getMonth() + 1;
    let collection = "";
    const year = currentDate.getFullYear().toString().substr(-2)
    
    if (currentMonth == 1 || currentMonth <= 3) {
        collection = `${baseName}_${year}_01_03`
    } else if (currentMonth >= 4 || currentMonth <= 6) {
        collection = `${baseName}_${year}_04_06`
    } else if (currentMonth >= 7 || currentMonth <= 9 ) {
        collection = `${baseName}_${year}_07_09`
    } else if (currentMonth >= 10 || currentMonth <= 12) {
        collection = `${baseName}_${year}_10_12`
    }
    return collection
    },


  modifyIsoMessage(unpackedMessage){
    let newUnpackedMessage = null;
    let dateAndTime =  this.formatTimestampForIsoRequest();
    unpackedMessage.dataElements[13] = dateAndTime.dateFormat;
    unpackedMessage.dataElements[12] = dateAndTime.timeFormat;
    unpackedMessage.dataElements[7] =  `${dateAndTime.dateFormat}${dateAndTime.timeFormat}`;

    // if(unpackedMessage.dataElements[2].substr(0, 6) === '539941'){
    // // || unpackedMessage.dataElements[2].substr(0, 6) === '513469'
    //     unpackedMessage.dataElements[23] = '000';
    // }
    newUnpackedMessage = unpackedMessage;
    return newUnpackedMessage;
  },

  isAndroidZenithContactlessTransactions(unpackedMessage){
    if(unpackedMessage.mti !== "0200") return false;
    if(unpackedMessage.dataElements[41].slice(0,4) !== "2057") return false;
    if(!unpackedMessage.dataElements[22]) return false;

    if(unpackedMessage.dataElements[22]){
        return (unpackedMessage.dataElements[22].slice(0,2) === "07") && (!unpackedMessage.dataElements[52]);
    }
  },


}
