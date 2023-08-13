/**
 * @author Abolaji
 * @module ExtractKeys from network message response
 * @lesson Avoid utf8 string concatination. Thanks.
 */
require('dotenv').config();
const Util = require('../helpers/Util');
const TerminalKey = require('../model/terminalkeysModel');
const TerminalStates = require('../model/terminalStatesModel');
const NeolifeConfig = require('../config/NeoLifeConfig.json');
const Journal = require('../model/journalmodel');
const moment = require('moment-timezone');
const {sendSocketNotification,socketDataType} = require('../socket/dataSocket');
const NetworkUtil = require('../helpers/NetworkUtil');
const StateDataModel = require('../model/stateDataModel');
const MerchantModel = require('../model/merchantsModel');
const dataElements = require("../config/dataelements64.json");

module.exports = {
    /**
     *Extract Key from network message response
     *@param {String} terminalId
     *@param {Object} unpackedMessage unpacked response from nibss
     *@param {String} processingCode processing code from the POS request
     *@param {Number} nibssIpNumber 1 for nibss IP1 and 2 for Nibss IP2 
     */
    getTerminalKey(terminalId, unpackedMessage, processingCode, nibssIpNumber, unpackedRequest = null) {

        // if the request is not for(master | session | pinkey) return
        if (!Util.keysProcessingCodes.find(c => c == processingCode))
            return;

        let key = Util.getSecurityKey(unpackedMessage);
        if (key)
            TerminalKey.findTerminal(terminalId).then(data => {
                newKeys = {};
                if (data) {
                    newKeys = data;
                }
                newKeys.terminalId = terminalId;
                // masterkey request
                if (processingCode == Util.TmkProcessingCode) {
                    if (nibssIpNumber == 1)
                        newKeys.masterKey_1 = key;
                    else
                        newKeys.masterKey_2 = key;
                } else if (processingCode == Util.SkProcessingCode) {
                    if (nibssIpNumber == 1)
                        newKeys.sessionKey_1 = key;
                    else
                        newKeys.sessionKey_2 = key;

                } else if (processingCode == Util.TpkProcessingCode) {
                    if (nibssIpNumber == 1)
                        newKeys.pinKey_1 = key;
                    else
                        newKeys.pinKey_2 = key;

                } else if (processingCode == Util.GParamProcessingCode) {
                    // newKeys.terminal_imei = Util.getIMEI(unpackedRequest);
                    // newKeys.nibss_merchantId = 
                }


                if (data) {
                    TerminalKey.updateOne({
                        terminalId: terminalId
                    }, newKeys, function (err, data) {
                        if (process.env.APP_ENV == "local") {
                            if (err) {
                                console.log(`error saving ${nibssIpNumber} key ${processingCode} \n ${err.toString()}`);
                            } else
                                console.log(`save nibss ${nibssIpNumber} key ${processingCode} ${data}`);
                        }
                        if(err){
                            Util.fileDataLogger("KEY_EXCHANGE_ERR",`error saving ${nibssIpNumber} key ${processingCode} \n ${err.toString()} ${terminalId} at ${new Date().toString()}`);
                        }
                    });
                } else {
                    TerminalKey.create(newKeys, function (err, data) {
                        if (process.env.APP_ENV == "local") {
                            if (err) {
                                console.log(`error saving ${nibssIpNumber} key ${processingCode} \n ${err.toString()}`);
                            } else
                                console.log(`save nibss ${nibssIpNumber} key ${processingCode} ${data}`);
                        }
                        if(err){
                            Util.fileDataLogger("KEY_EXCHANGE_ERR",`error saving ${nibssIpNumber} key ${processingCode} \n ${err.toString()} ${terminalId} at ${new Date().toString()}`);
                        }
                    });
                }


            });

    },

    /**
     * decrypt master key with xor of two component keys
     * @param {String} masterKey encrypted master key
     * @param {Number} nibssVer indicates whether the masterkey is for Nibss 1 or 2 IP
     * @returns {String} clear master key
     */
    getDecryptedMasterKey(masterKey, nibssVer) {
        let componentKeys = Util.xorComponentKey(nibssVer);

        console.log("XOR Component keys UPSL => ", componentKeys);


        return Util.decrypt3DES(masterKey, 'hex', componentKeys, 'hex', 'hex');
    },

    /**
     * decrypt master key with xor of two component keys
     * @param {String} masterKey encrypted master key
     * @param {Number} nibssVer indicates whether the masterkey is for Nibss 1 or 2 IP
     * @returns {String} clear master key
     */
    getDecryptedIswMasterKey(masterKey, nibssVer) {
        let componentKeys = Util.xorISWComponentKey(nibssVer);
        console.log("XOR Component keys ISW => ", componentKeys);
        return Util.decrypt3DES(masterKey, 'hex', componentKeys, 'hex', 'hex');
    },
    

    /**
     * decrypt sessionkey with master key
     * @param {String} sessionKey encrypted session key
     * @param {String} masterKey encrypted masterkey
     * @param {Number} nibssVer indicates whether the key is for Nibss 1 or 2 IP
     */
    getDecryptedSessionKey(sessionKey, masterKey, nibssVer) {

        console.log("nibss version => ", nibssVer);

        console.log("Encrypted Master key => ", masterKey);

        console.log("Encrypted Session key => ", sessionKey);

        let dTmk = nibssVer === "virtualtid" ? masterKey: this.getDecryptedMasterKey(masterKey, nibssVer);

        console.log("Decrypted Master kEY => ", dTmk);

        return Util.decrypt3DES(sessionKey, 'hex', dTmk, 'hex', 'hex');
    },

    /**
     * decrypt pinkey with master key
     * @param {String} pinKey encrypted pin key
     * @param {String} masterKey encrypted masterkey || decrypted masterkey
     * @param {Number} nibssVer indicates whether the key is for Nibss 1 or 2 IP
     * @param {String} nibssVer === "virtualtid" indicates the masterkey to be used is already clear
     */
    getDecryptedPinKey(pinKey, masterKey, nibssVer) {
        let dTmk = nibssVer !== "virtualtid" ? this.getDecryptedMasterKey(masterKey, nibssVer) : masterKey;

        console.log(nibssVer);
        console.log(dTmk);
        return Util.decrypt3DES(pinKey, 'hex', dTmk, 'hex', 'hex');
    },


    /**
     * decrypt pinkey with master key
     * @param {String} pinKey encrypted pin key
     * @param {String} masterKey encrypted masterkey || decrypted masterkey
     * @param {Number} nibssVer indicates whether the key is for Nibss 1 or 2 IP
     * @param {String} nibssVer === "virtualtid" indicates the masterkey to be used is already clear
     */
    getDecryptedIswPinKey(pinKey, masterKey, nibssVer) {
        let dTmk = nibssVer !== "virtualtid" ? this.getDecryptedIswMasterKey(masterKey, nibssVer) : masterKey;
        console.log(nibssVer);
        console.log(dTmk);
        return Util.decrypt3DES(pinKey, 'hex', dTmk, 'hex', 'hex');
    },
    

    /**
     * change RRN, re-encrypt pinblock and rehash isomessage
     * @param {String} requestData request data from POS
     * @param {Object} isoParser for unpacking and repacking iso message
     * @param {String} sessionKey clear sessionKey
     * @param {String} decryptKey clear pinKey to decrypt the pinblock
     * @param {String} encryptKey clear pinkey to encrypt the pinblock
     */
    async rehashIsoMessageOnlineCard(requestData, isoParser, sessionKey, decryptKey, encryptKey, isFailOver = true) {
        // console.log("here");
        let withoutLength = requestData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);

        if (isFailOver) {
            let RRN = Util.getRRN(unpackedMessage);
            let newRRN = Number(RRN);
            if(Util.isNeolifePOS(unpackedMessage))
            {
                newRRN = await this.getNeoLifeUniqueRRN(unpackedMessage)
            }
            else if(Util.isFRSCPOS(unpackedMessage))
            {
                newRRN = await this.getFRSCUniqueRRN(unpackedMessage);
            }
            else if(Util.isSTERLINGPOS(unpackedMessage))
            {
                newRRN = await this.getSTERLINGUniqueRRN(unpackedMessage);
            }
            else
                newRRN++;

            newRRN = Util.padLeft(newRRN.toString(), "0", 12);
            console.log(`Old RRN: ${RRN}, New RRN ${newRRN}`);

            while (withoutLength.includes(RRN))
                withoutLength = withoutLength.replace(RRN, newRRN);
        }

        let pinBlock = Util.getPinBLock(unpackedMessage);
        // console.log('pin block: '+pinBlock);
        let clearPin = Util.decrypt3DES(pinBlock, 'hex', decryptKey, 'hex', 'hex');
        // console.log('pin :'+clearPin);
        let newPinBlock = Util.encrypt3DES(clearPin, 'hex', encryptKey, 'hex', 'hex');
        // console.log('new pinblock: '+newPinBlock);

        while (withoutLength.includes(pinBlock))
            withoutLength = withoutLength.replace(pinBlock, newPinBlock);

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(sessionKey, data);
        // console.log(newHash);
        data = data + newHash.toUpperCase();
        let length = Util.getLengthBytes(data.length);
        // console.log(length);
        return Buffer.concat([length,Buffer.from(data,'utf8')]);
    },

    /**
     * change RRN and rehash the Iso message with the sessionKey
     * @param {String} requestData request data from POS
     * @param {Object} isoParser for unpacking and repacking the Iso message
     * @param {String} key sessionkey to rehash the iso message
     */
    async rehashIsoMessage(requestData, isoParser, key, isFailOver = true) {
        let withoutLength = requestData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);

        if (isFailOver) {
            let RRN = Util.getRRN(unpackedMessage);
            let newRRN = Number(RRN);
            if(Util.isNeolifePOS(unpackedMessage))
            {
                newRRN = await this.getNeoLifeUniqueRRN(unpackedMessage);
            }
            else if(Util.isFRSCPOS(unpackedMessage))
            {
                newRRN = await this.getFRSCUniqueRRN(unpackedMessage);
            }
            else if(Util.isSTERLINGPOS(unpackedMessage))
            {
                newRRN = await this.getSTERLINGUniqueRRN(unpackedMessage);
            }
            else
                newRRN++;
            
            newRRN = Util.padLeft(newRRN.toString(), "0", 12);
            console.log(`Old RRN: ${RRN}, New RRN ${newRRN}`);

            while (withoutLength.includes(RRN))
                withoutLength = withoutLength.replace(RRN, newRRN);
        }

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        let newHash = Util.signIsoMessage(key, data);
        data = data + newHash.toUpperCase();
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     *  rehash unpacked(data element)  Iso message with the sessionKey
     * @param {Object} unpackedDataelement request data elements from POS
     * @param {Object} isoParser for unpacking and repacking the Iso message
     * @param {String} key sessionkey to rehash the iso message
     */
    rehashUnpackedIsoMessage(unpackedDataelement, isoParser, key, mti=null) {
        
        let withoutLength = isoParser.pack(mti,unpackedDataelement).isoMessage;

        // console.log("Unpackaed Data Element", unpackedDataelement);

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        let newHash = Util.signIsoMessage(key, data);
        data = data + newHash.toUpperCase();

        console.log("data without length", data);

        let length = Util.getLengthBytes(data.length);

        console.log("bin length ",length); 
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    rehashUnpackedIsoMessageUPLS(mti,unpackedDataelement, isoParser, key) {
        
        let withoutLength = isoParser.pack(mti,unpackedDataelement).isoMessage;

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        let newHash = Util.signIsoMessage(key, data);

        console.log("New hashed F128 ", newHash);

        data = data + newHash.toUpperCase();
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * reshash iso message response from nibss with IP 1 keys
     * @param {String} responseData response data from nibss
     * @param {String} key sessionKey to rehash the message 
     */
    rehashIsoResponse(responseData, key) {
        let withoutLength = responseData.substr(2);
        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * reshash iso message response from nibbs and add frsc validation number
     * @param {String} responseData response data from nibss
     * @param {String} key sessionKey to rehash the message 
     * @param {Object} isoParser 
     * @param {String} validationNumber result from frsc notification
     */
    rehashIsoResponseForFrsc(responseData, key,isoParser, validationNumber) {
        let withoutLength = responseData.substr(2);

        let unpackedMessage = isoParser.unpack(withoutLength);
        unpackedMessage.dataElements[59] = validationNumber;

        withoutLength = isoParser.pack("0210", unpackedMessage.dataElements).isoMessage;
        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    buildIsowithVasResponse(responseData, vasRes) {
        let iso = Buffer.from(responseData);
        let vas = Buffer.from(vasRes,"utf8");
        let data = Buffer.concat([iso,vas]);
        let decLength =  data.toString("hex").length/2;
        let length = Util.getLengthBytes(decLength);
        console.log("dec length:",decLength);
        return Buffer.concat([length, data]);
    },

    /**
     * reshash iso message response to terminal with rescode and custom data
     * @param {String} responseData response data from nibss
     * @param {String} key sessionKey to rehash the message 
     * @param {Object} isoParser 
     * @param {String} customMsg result from frsc notification
     */
    rehashIsoResponseCustom(responseData, key,isoParser, customMsg, resCode) {
        let withoutLength = responseData.substr(2);

        let unpackedMessage = isoParser.unpack(withoutLength);
        unpackedMessage.dataElements[59] = customMsg;
        unpackedMessage.dataElements[39] = resCode;

        withoutLength = isoParser.pack("0210", unpackedMessage.dataElements).isoMessage;
        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * 
     * @param {String} nibssResponseData response iso message from nibss
     * @param {String} key session key to rehash the data
     * @param {Object} isoParser for unpacking and
     * @param {String} resCode response code from tams 
     * @param {Object} result tams transaction result
     */
    rehashIsoResponseFromTams(nibssResponseData, key, isoParser, resCode, result) {
        let withoutLength = nibssResponseData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);
        unpackedMessage.dataElements[39] = resCode;
        unpackedMessage.dataElements[38] = result.authId;
        unpackedMessage.dataElements[52] = null;

        if (result.iccResponse)
            unpackedMessage.dataElements[55] = result.iccResponse;
        else unpackedMessage.dataElements[55] = null;

        withoutLength = isoParser.pack("0210", unpackedMessage.dataElements).isoMessage;


        if (result.rrn.length > 0) {
            let RRN = Util.getRRN(unpackedMessage);
            while (withoutLength.includes(RRN))
                withoutLength = withoutLength.replace(RRN, result.rrn);
        }

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * 
     * @param {String} nibssResponseData response iso message from nibss
     * @param {String} key session key to rehash the data
     * @param {Object} isoParser for unpacking and
     * @param {String} resCode response code from tams
     */
    rehashIso06ResponseCode(mti,nibssResponseData, key, isoParser, resCode) {
        let withoutLength = nibssResponseData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);
        unpackedMessage.dataElements[39] = resCode;
        unpackedMessage.dataElements[38] = null;
        unpackedMessage.dataElements[52] = null;
        unpackedMessage.dataElements[55] = null;

        withoutLength = isoParser.pack(mti, unpackedMessage.dataElements).isoMessage;

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * 
     * @param {String} requeryRequest response iso message from nibss
     * @param {String} key session key to rehash the data
     * @param {Object} isoParser for unpacking and
     * @param {String} resCode response code from tams
     */
    rehashIsoRequeryResponse(requeryRequest, key, isoParser,journal,resCode) {
        let withoutLength = requeryRequest.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);
        unpackedMessage.dataElements[39] = resCode;
        unpackedMessage.dataElements[52] = null;
        unpackedMessage.dataElements[38] = journal.authCode || null;
        unpackedMessage.dataElements[55] = journal.script || null;

        withoutLength = isoParser.pack("0211", unpackedMessage.dataElements).isoMessage;

        let newRRN = Util.getUsedRRN(journal);
        if (newRRN != journal.rrn) {
            let RRN = journal.rrn;
            while (withoutLength.includes(RRN))
                withoutLength = withoutLength.replace(RRN, newRRN);
        }

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },
    
    //test only *************
    rehashIsoTestResponse(request, key, isoParser,resCode) {
        let withoutLength = request.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);
        unpackedMessage.dataElements[39] = resCode;
        unpackedMessage.dataElements[52] = null;
        unpackedMessage.dataElements[38] =  null;
        unpackedMessage.dataElements[55] =  null;

        withoutLength = isoParser.pack("0210", unpackedMessage.dataElements).isoMessage;

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * 
     * @param {Object} requestData requery request
     * @param {String} key hash key
     * @param {Object} isoParser iso parser
     * @param {Object} journal transaction details
     * @param {Object} terminal terminal object
     * @param {Number} nibssVer to determine key to use;
     */
    reshashIsoMessageForRequeryReversal(requestData, key, isoParser, journal,terminal) {
        let withoutLength = requestData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);

        unpackedMessage.dataElements[56] = '4021';
        unpackedMessage.dataElements[95] = "000000000000000000000000D00000000D00000000";
        unpackedMessage.dataElements[90] = Util.getReversalField90(unpackedMessage);
        withoutLength = isoParser.pack("0420", unpackedMessage.dataElements).isoMessage;

        let usedRRN = Util.getUsedRRN(journal);
        let RRN = Util.getRRN(unpackedMessage);
        if (RRN != usedRRN) {
            while (withoutLength.includes(RRN))
                withoutLength = withoutLength.replace(RRN, usedRRN);

            let pinBlock = Util.getPinBLock(unpackedMessage);
            if (pinBlock) {
                let decryptingKey = this.getDecryptedPinKey(terminal.pinKey_1, terminal.masterKey_1, 1);
                let encryptingKey = this.getDecryptedPinKey(terminal.pinKey_2, terminal.masterKey_2, 2);
                let clearPin = Util.decrypt3DES(pinBlock, 'hex', decryptingKey, 'hex', 'hex');
                let newPinBlock = Util.encrypt3DES(clearPin, 'hex', encryptingKey, 'hex', 'hex');

                while (withoutLength.includes(pinBlock))
                    withoutLength = withoutLength.replace(pinBlock, newPinBlock);
            }
            
        }

        // console.log(`reversal data: ${withoutLength}`);

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    /**
     * 
     * @param {String} nibssResponseData response iso message from nibss
     * I think the above is request data from POS not response from NIBSS.
     * @param {String} key session key to rehash the data
     * @param {Object} isoParser for unpacking and
     * @param {Object} result tams transaction result
     * @param {Object} route direct | null
     */
    rehashIsoResponseFromInterswitch(nibssResponseData,key,isoParser,result, route = null) {
        // let withoutLength = route == null ? nibssResponseData.substr(2) : nibssResponseData;

        let withoutLength = nibssResponseData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);

        if(!unpackedMessage.dataElements[3]) {
            return;
        }

        unpackedMessage.dataElements[39] = result.resCode == 'A1' ? '96' : result.resCode;
        unpackedMessage.dataElements[38] = result.authCode || null;
        unpackedMessage.dataElements[52] = null;
        
        if(result.iccResponse != null )
            unpackedMessage.dataElements[55] = result.iccResponse;
        else unpackedMessage.dataElements[55] = null;

        if(unpackedMessage.mti == "0200"){
            withoutLength = isoParser.pack("0210",unpackedMessage.dataElements).isoMessage;
        }else if(unpackedMessage.mti == "0420") {
            // console.log('result from ISW entered Reversal condition');
            unpackedMessage.dataElements[56] = null;
            unpackedMessage.dataElements[90] = null;
            unpackedMessage.dataElements[95] = null;
            withoutLength = isoParser.pack("0430",unpackedMessage.dataElements).isoMessage;
        }else if(unpackedMessage.mti == "0100"){
            withoutLength = isoParser.pack("0110",unpackedMessage.dataElements).isoMessage;
        }else{
            withoutLength = isoParser.pack("0210",unpackedMessage.dataElements).isoMessage;
        }

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log("iso back to pos", newHash);
        data = data + newHash;

        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },

    reshashIsoMessageForReversal(requestData, key, isoParser) {
        let withoutLength = requestData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);

        unpackedMessage.dataElements[56] = '4021';
        unpackedMessage.dataElements[95] = "000000000000000000000000D00000000D00000000";
        unpackedMessage.dataElements[90] = Util.getReversalField90(unpackedMessage);
        withoutLength = isoParser.pack("0420", unpackedMessage.dataElements).isoMessage;

        // console.log(`reversal data: ${withoutLength}`);

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        // console.log('without hash' + data);
        let newHash = Util.signIsoMessage(key, data);
        // console.log(newHash);
        data = data + newHash;
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data,'utf8')]);
    },


    /**
     *Save call home data
     *@param {Object} unpackedMessage unpacked callhome request from POS
     */
    async saveCallhomeData(unpackedMessage) {
        let terminalId = Util.getTerminalId(unpackedMessage);

        let newState = {};
        let stateData = null;

        newState.terminalId = terminalId;

        let callhomefieldData = unpackedMessage.dataElements['62'];

        let callhomeData = Util.parseCallHomeTlvData(callhomefieldData);

        if (callhomeData) {

            newState.serialNumber = callhomeData['01'];
            newState.applicationVersion = callhomeData['09'];
            newState.paymentChannelModel = callhomeData['10'];
            newState.stateInformation = callhomeData['11'];
            newState.communicationsServiceProvider = callhomeData['12'] ? callhomeData['12'] : "";

            try {
                stateData = JSON.parse(callhomeData["11"]);

                stateData.ss = Number(stateData.ss);

                try {
                    if (stateData.lTxnAt)
                        stateData.lTxnAt = moment(stateData.lTxnAt).toDate();
                    else
                        stateData.lTxnAt = moment().toDate(); 
                }
                catch(err){
                    stateData.lTxnAt = moment().toDate();
                }

                stateData.ctime = moment(stateData.ctime).toDate();

                newState.stateData = stateData;

                // parse cloc data
                if(typeof stateData.cloc === 'string'){
                    try {
                        stateData.cloc = JSON.parse(stateData.cloc);
                    } catch (error) {

                        let cStr = stateInformation.cloc;
                        cStr = cStr.substring(1, cStr.length - 1);
                        const cloc = {};
                        for (const ite of cStr.split(',')) {
                          const [key, val] = ite.trim().split(':');
                          if (key && val) cloc[key] = val;
                        }
                        stateInformation.cloc = cloc;
                    }
                }
                //////////////////////////////////////////

                if((stateData.cloc || {}).mcc){
                    let geoData = await NetworkUtil.getGeoData(stateData.cloc);
                    if(geoData){
                        console.log(JSON.stringify(geoData))
                        if(geoData.lat)stateData.lat = geoData.lat;
                        if(geoData.lon)stateData.lon = geoData.lon;
                        if(geoData.address)stateData.geo_addr = geoData.address
                    }
                }
            
                console.log(JSON.stringify(stateData))
                newState.stateData = stateData;

            } catch (error) {}

            TerminalStates.create(newState, function (err, data) {

                if (err) {
                    Util.fileDataLogger("KEY_EXCHANGE_ERR",`error saving Call Data Terminal ID : ${terminalId} at : ${new Date().toString()} \n ${err.toString()}`);
                    console.log(`error saving Call Data Terminal ID : ${terminalId} at : ${new Date().toString()} \n ${err.toString()}`);
                } else
                    console.log(`Saved Callhome Data Terminal : ${terminalId} at ${new Date().toString()}`);

            });


            sendSocketNotification(socketDataType.terminalHealth,newState);

            if(stateData != null){
                this.updateStateData(terminalId,stateData).then((done)=>{
                    
                }).catch((err)=>{

                });
            }


            return newState;
        }

    },

    prepareIsoRequestForKeyExchange(processingCode, terminalId, iso8583Parser) {

    let packedMessage = {};
    // let packedMessageStr = '';

    if (!Util.keysExchangeProcessingCodes.includes(processingCode)) {
      return;
    }
    
    dataElements[3] = `${processingCode}0000`;
    dataElements[7] = Util.formatTimestampForIsoRequest().dateFormat + Util.formatTimestampForIsoRequest().timeFormat;
    dataElements[11] = Util.formatTimestampForIsoRequest().timeFormat;
    dataElements[12] = Util.formatTimestampForIsoRequest().timeFormat;
    dataElements[13] = Util.formatTimestampForIsoRequest().dateFormat;
    dataElements[41] = terminalId;

    let reqMsg = {};
    Object.assign(reqMsg, dataElements);

    packedMessage = this.prepareISOmsg("0800", dataElements, iso8583Parser);

    console.log(packedMessage.toString().substring(2));

    const unpackedMessage = iso8583Parser.unpack(packedMessage.toString().substring(2));

    console.log(unpackedMessage)

    // packedMessageStr = `${packedMessage.mti}${packedMessage.hexadecimalBitmap.substring(0, 16)}${packedMessage.dataElementPart}`;

    return { unpackedMessage, packedMessage };

  },

    async updateStateData(terminalId,stateData){
        let ref = terminalId + (moment().tz("Africa/Lagos").format("YYYY-MM-DD"));
        stateData.ref = ref;
        let merchant = await MerchantModel.findOne({terminals : {$in : [terminalId]}});
        if(merchant){
            stateData.merchantData = merchant._id;
        }
        StateDataModel.updateOne({ref : ref},stateData,{upsert : true},(err, data)=>{
            if (err) {
                Util.fileDataLogger("KEY_EXCHANGE_ERR",`error saving State Data Terminal ID : ${terminalId} at : ${new Date().toString()} \n ${err.toString()}`);
                console.log(`error saving State Data Terminal ID : ${terminalId} at : ${new Date().toString()} \n ${err.toString()}`);
            } else
                console.log(`Saved Callhome State-Data Terminal : ${terminalId} at ${new Date().toString()}`);
        });
    },


    /**
     * check if the transaction is from GNLD POS, generate unique rrn
     * @param {Object} unpackedMessage original request data from POS
     */
    async getNeoLifeUniqueRRN(unpackedMessage){
        
        let isNeolifePos = Util.isNeolifePOS(unpackedMessage);
        if(!isNeolifePos)
            return false;

        let startDate = moment().startOf('day').toDate();
        let endDate = moment().endOf('day').toDate();

        let sequence = await Journal.find({customerRef: { $regex : /^neolife/},transactionTime: {
            $gte: startDate,
            $lte: endDate
        }},["customerRef"]).countDocuments();
        let rrnDate = Util.getShortDate();
        let nextSequence = sequence+1;
        let paddedSequence = Util.padLeft(nextSequence.toString(),"0",6);
        return rrnDate + paddedSequence;
    },

    /**
     * check if the transaction is from GNLD POS, generate unique rrn
     * @param {Object} unpackedMessage original request data from POS
     */
    async getFRSCUniqueRRN(unpackedMessage){
        
        let isFRSCPos = Util.isFRSCPOS(unpackedMessage);
        let isSterlingFRSCPOS = Util.isSTERLINGPOS(unpackedMessage);
        if(!isFRSCPos && !isSterlingFRSCPOS)
            return false;

        let startDate = moment().startOf('day').toDate();
        let endDate = moment().endOf('day').toDate();

        let sequence = await Journal.find({ $or: [ {customerRef: { $regex : /^frsc/} },
             { customerRef: { $regex : /^str_frsc/} }], transactionTime: {
            $gte: startDate,
            $lte: endDate
        }},["customerRef"]).countDocuments();
        let rrnDate = Util.getShortDate();
        let nextSequence = sequence+1;
        let paddedSequence = Util.padLeft(nextSequence.toString(),"0",6);


        return rrnDate + paddedSequence;
    },
    
    /**
     * check if the transaction is from GNLD POS, generate unique rrn
     * @param {Object} unpackedMessage original request data from POS
     */
    async getSTERLINGUniqueRRN(unpackedMessage){
        
        let isSTERLINGPos = Util.isSTERLINGPOS(unpackedMessage);
        if(!isSTERLINGPos)
            return false;

        let startDate = moment().startOf('day').toDate();
        let endDate = moment().endOf('day').toDate();

        let sequence = await Journal.find({customerRef: { $regex : /^str_frsc/},transactionTime: {
            $gte: startDate,
            $lte: endDate
        }},["customerRef"]).countDocuments();
        let rrnDate = Util.getShortDate();
        let nextSequence = sequence+1;
        let paddedSequence = Util.padLeft(nextSequence.toString(),"0",6);
        return rrnDate + paddedSequence;
    },
    

    /**
     * change POS RRN to unique and rehash the Iso message with the sessionKey
     * @param {String} requestData request data from POS
     * @param {Object} isoParser for unpacking and repacking the Iso message
     * @param {String} key sessionkey to rehash the iso message
     * @param {String} uniqueRRN newly generated rrn
     */
    rehashIsoUniquRRNMessage(requestData, isoParser, key, uniqueRRN, truncateEchoData = false) {
        let withoutLength = requestData.substr(2);
        let unpackedMessage = isoParser.unpack(withoutLength);

        let RRN = Util.getRRN(unpackedMessage);
        console.log(`Old RRN: ${RRN}, New RRN ${uniqueRRN}`);

        if (RRN != uniqueRRN)
            while (withoutLength.includes(RRN))
                withoutLength = withoutLength.replace(RRN, uniqueRRN);

        if(truncateEchoData){
            let customerRef = Util.getCustomerRefData(unpackedMessage);
            let replaceData = '';

            while(replaceData.length < customerRef.length){
                replaceData+= '*';
            }

            withoutLength = withoutLength.replace(customerRef, replaceData);
        }

        // length of the hash is 64, remove the hash, rehash and append the new hash
        let data = withoutLength.substr(0, (withoutLength.length - 64));
        let newHash = Util.signIsoMessage(key, data);
        data = data + newHash.toUpperCase();
        let length = Util.getLengthBytes(data.length);
        return Buffer.concat([length, Buffer.from(data, 'utf8')]);
    },
      /**
     * 
     * @param {String} mti message type indicator
     * @param {Object} unpackedMsg message data element
     * @param {Oject} ciso Iso packer
     * @param {String} key hashing key (optional)
     */
    prepareISOmsg(mti,unpackedMsg,ciso,key=null){
        let packed = ciso.pack(mti,unpackedMsg);

        console.log("Packed Messgae", packed);

        let isoMsg = packed.isoMessage;
        if(key){
            let hash = Util.signIsoMessage(key,isoMsg);
            isoMsg +=hash;
        }
        console.log("Iso MESSAGE => ", isoMsg)
        let binLen = Util.getLengthBytes(isoMsg.length);
        return Buffer.concat([binLen,Buffer.from(isoMsg,"utf8")]);
    },

    /**
     * decrypt master key with xor of two component keys
     * @param {String} masterKey encrypted master key
     * @param {Number} nibssVer indicates whether the masterkey is for Nibss 1 or 2 IP
     * @returns {String} clear master key
     */
    //Pick the encrypted PINKEY
    //Decrtyped

     getDecryptedAccessPinKey(pinKey, nibssVer) {
        let componentKeys = Util.xorAccessRoutingComponentKey(nibssVer);
        console.log("XOR Component keys Access Routing => ", componentKeys);
        return Util.decrypt3DES(pinKey, 'hex', componentKeys, 'hex', 'hex');
    },    



}
