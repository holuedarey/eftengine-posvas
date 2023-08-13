require('dotenv').config();
const TerminalKey = require('../model/terminalkeysModel');
const SocketClient = require('../socket/socketclient');
const Util = require('../helpers/Util');
const ExtractKey = require('../helpers/ExtractKeys');
const { changeF60ContentForUpsl } = require('../helpers/Util');
const terminalkeysModel = require('../model/terminalkeysModel');
const baseSubFieldMessage = require("../ciso8583/engine/subField-data-elements.json");


class UpslHandler {
 
    constructor(unpackedMessage, requestData, ciso){
        this.unpackedMessage = unpackedMessage;
        this.ciso = ciso;
        this.requestData = requestData;

        this.Ip = process.env.UPSL_IP;
        this.Port = process.env.UPSL_PORT;
        this.terminalId = Util.getTerminalId(unpackedMessage);
    }

    async prepTerminal(){
        let TMK = await this.getMasterKey();
        if(!TMK) return;

        let TSK = await this.getSessionKey();
        if(!TSK) return;

        let TPK = await this.getPinKey();
        if(!TPK) return;

        let key = ExtractKey.getDecryptedSessionKey(TSK,TMK,3);
        let param = await this.getParameters(key);

        let conf = {
            TMK : TMK,
            TPK : TPK,
            TSK : TSK,
            PARAM : param
        }

        console.log("UPSL KEYS => ", JSON.stringify(conf));
        console.log("------------||----------------")

        TerminalKey.update({terminalId : this.terminalId}, {$set : {upslKey : conf}},{upsert: true, setDefaultsOnInsert: true},(err,data)=>{
            if(err){
                console.error(`upsl-Error saving UPSL config, TID : ${this.terminalId}, ${err}`)
            }else{
                console.log(`UPSL config saved, TID : ${this.terminalId}`)   
            }
        })
        
    }

    async getMasterKey(){
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.unpackedMessage.dataElements);
            // reqMsg["41"] = "20442R11";

            console.log("UPSL MASTER KEY REQUEST => ", reqMsg)
            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage), `Message from POS for TMK ${JSON.stringify(this.unpackedMessage.dataElements)}`);

            let isoMsg = ExtractKey.prepareISOmsg("0800", reqMsg, this.ciso);

            let response = await this.sendSocketData(isoMsg);

            let unpackedResponse = this.ciso.unpack(response.toString().substr(2));
            
            console.log("UPSL MASTER KEY => ", unpackedResponse);
            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage),`Master Key Response for UPSL ${JSON.stringify(unpackedResponse.dataElements)}`);
            // Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage.dataElements["41"]),`Prepping going to UPSL for payattitude ${JSON.stringify(unpackedResponse.dataElements)} Preps here.`);
    
            return Util.getSecurityKey(unpackedResponse);
        } catch (error) {
            console.log(`error getting USPL TMK for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error getting USPL TMK for TID : ${this.terminalId}, at ${new Date()}, ${JSON.stringify(error.message)}`);
            return false;
        } 
    }


// UPSL_WITHDRAWAL_TERMINAL_IDS="2UP1T007,2UP1T008,2UP1T009,2UP1T010,2UP1T011,2UP1T012,2UP1T013"

    async getSessionKey() {
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.unpackedMessage.dataElements);

            reqMsg['3'] = "9B0000";
            // reqMsg["41"] = "20442R11";
            console.log(reqMsg)
            let isoMsg = ExtractKey.prepareISOmsg("0800", reqMsg, this.ciso);

            let response = await this.sendSocketData(isoMsg);
            let unpackedResponse = this.ciso.unpack(response.toString().substr(2));

            console.log("UPSL SESSION KEY => ", unpackedResponse);
            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage),`Session Key Response for UPSL ${JSON.stringify(unpackedResponse.dataElements)}`);

            return Util.getSecurityKey(unpackedResponse);

        } catch (error) {
            console.log(`error getting USPL TSK for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId, `error getting USPL TSK for TID : ${this.terminalId}, at ${new Date()}, ${JSON.stringify(error.message)}`);
            return false;
        }
    }

    async getPinKey(){
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.unpackedMessage.dataElements);

            reqMsg['3'] = "9G0000";
            // reqMsg["41"] = "20442R11";
            let isoMsg = ExtractKey.prepareISOmsg("0800",reqMsg,this.ciso);

            let response = await this.sendSocketData(isoMsg);
            let unpackedResponse = this.ciso.unpack(response.toString().substr(2));
            
            console.log("UPSL PIN KEY => ", unpackedResponse);
            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage),`PIN Key Response for UPSL ${JSON.stringify(unpackedResponse.dataElements)}`);

            return Util.getSecurityKey(unpackedResponse);

        } catch (error) {
            console.log(`error getting USPL TPK for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error getting USPL TPK for TID : ${this.terminalId}, at ${new Date()}, ${JSON.stringify(error)}`);
            return false;
        } 
    }

    async getParameters(key){
        try {
            let reqMsg = {};
            Object.assign(reqMsg, this.unpackedMessage.dataElements);

            reqMsg['3'] = "9C0000";
            // reqMsg["41"] = "20442R11";
            let isoMsg = ExtractKey.prepareISOmsg("0800", reqMsg, this.ciso, key);

            let response = await this.sendSocketData(isoMsg);
            let unpackedResponse = this.ciso.unpack(response.toString().substr(2));
            
            console.log("UPSL GET PARAMS KEY => ", unpackedResponse);
            Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage),`Params Download Response for UPSL ${JSON.stringify(unpackedResponse.dataElements)}`);
            
            return Util.getConfigData(unpackedResponse);

        } catch (error) {
            console.log(`error getting USPL TPK for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error getting USPL TPK for TID : ${this.terminalId}, at ${new Date()}, ${JSON.stringify(error)}`);
            return false;
        } 
    }


    async sendTransactionRequest(terminal, withdrawalTerminal=null){ 
        try {
            // console.log("Withdrawal Terminal Object", withdrawalTerminal);
            let reqMsg = {};
            Object.assign(reqMsg,this.unpackedMessage.dataElements);
            reqMsg["32"] = "11129";

            if(withdrawalTerminal !== null) {

                reqMsg["18"] = "6010";
                reqMsg["53"] = null;

                reqMsg["41"] = withdrawalTerminal.terminalId;
                reqMsg["42"] = withdrawalTerminal.merchantId;
                reqMsg["43"] = process.env.UP_WITHDRAWAL_MERCHANTNAME;

            }
            // reqMsg["41"] = withdrawalTerminal !== null ? process.env.UP_WITHDRAWAL_TERMINALID : this.terminalId;
            reqMsg["59"] = null;
            reqMsg["60"] = Util.changeF60ContentForUpsl(this.unpackedMessage) == "" ? null : Util.changeF60ContentForUpsl(this.unpackedMessage);
            //console.log("Field 60: => ", reqMsg["60"]);
            // reqMsg["42"] = terminal.upslKey.PARAM["03015"];
            let pinBlock = this.unpackedMessage.dataElements["52"];
            // const terminalKeys = await TerminalKey.findTerminal(unpackedMessage.dataElements[41])
            if(terminal && !terminal.isVirtualTid && !terminal.upslKey){
                // let upsl = new UPSL(unpackedMessage, data, iso8583Parser);
                await this.prepTerminal();
                Util.fileDataLogger(Util.getTerminalId(this.unpackedMessage),`Transaction going to UPSL for payattitude Preps here.`);
                terminal = await TerminalKey.findTerminal(reqMsg["41"]);
            }

            const upslKeys = withdrawalTerminal !== null ? withdrawalTerminal : terminal;

            const keysVersion = terminal.isVirtualTid === true ?  "virtualtid" : 1;

            if(pinBlock){
                let nPinkey = ExtractKey.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1,keysVersion);
                let clearPinblock = Util.decrypt3DES(pinBlock,"hex",nPinkey,"hex","hex");
                // console.log(`clear pin ${clearPinblock}`)
    
                let uPinkey  = ExtractKey.getDecryptedPinKey(upslKeys.upslKey.TPK,upslKeys.upslKey.TMK,"up");
                let upPinblock = Util.encrypt3DES(clearPinblock,"hex",uPinkey,"hex","hex");
    
                // console.log(`up pin: ${upPinblock}`);
                reqMsg["52"] = upPinblock;
            }
            // console.log(this.unpackedMessage.dataElements);
            // console.log(JSON.stringify(reqMsg));

            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`UPSL Keys used  ${JSON.stringify(upslKeys)} transaction at ${new Date().toString()}`);
            let tsk = ExtractKey.getDecryptedSessionKey(upslKeys.upslKey.TSK,upslKeys.upslKey.TMK,"up");

           // console.log("Clear TSK ", tsk);
            Util.fileDataLogger(this.terminalId,`USPL Keys used for Txn: ${JSON.stringify(upslKeys)}, at ${new Date()}`);

            let isoMsg = ExtractKey.rehashUnpackedIsoMessageUPLS(this.unpackedMessage.mti,reqMsg,this.ciso,tsk);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`UPSL Message sent for transaction  ${JSON.stringify(this.unpackedMessage.dataElements)} transaction at ${new Date().toString()}`);
            // Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`UPSL ISOMessage sent for transaction ${isoMsg.toString()} transaction at ${new Date().toString()}`);
            // console.log("ISOMESSAGE => ", isoMsg.toString());

            let response = await this.sendSocketData(isoMsg);
            // console.log("RESPONSE DATA, ", JSON.stringify(this.ciso.unpack(response.toString().substr(2))));
            // reversal test with UP
            //return response;

            return response;
    
        } catch (error) {
            console.log(`error processing transaction with UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error processing transaction with UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }

    }

    async sendBalanceEnquiryRequest(terminal) {

        try {

            let reqMsg = {};

            Object.assign(reqMsg,this.unpackedMessage.dataElements);
            
            reqMsg["2"] = null;
            reqMsg["14"] = null;
            reqMsg["23"] = null;
            reqMsg["35"] = null;
            reqMsg["40"] = null;
            reqMsg["59"] = null;

            // reqMsg["55"] = null;
            reqMsg["60"] = Util.changeF60ContentForUpsl(this.unpackedMessage) == "" ? null : Util.changeF60ContentForUpsl(this.unpackedMessage);
            // reqMsg["42"] = terminal.upslKey.PARAM["03015"];

            //console.log("MTI => ", this.unpackedMessage.mti)
    
            //console.log(this.unpackedMessage.dataElements);

            //console.log(JSON.stringify(reqMsg));
    
            let tsk = ExtractKey.getDecryptedSessionKey(terminal.upslKey.TSK,terminal.upslKey.TMK,"up");

            let isoMsg = ExtractKey.rehashUnpackedIsoMessageUPLS(this.unpackedMessage.mti,reqMsg,this.ciso,tsk);

            //console.log("ISOMESSAGE => ", isoMsg.toString());

            let response = await this.sendSocketData(isoMsg);
            //console.log("RESPONSE DATA, ", JSON.stringify(this.ciso.unpack(response.toString().substr(2))))
            return response;
            
        } catch (error) {
            console.log(`error processing balance enquiry UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error processing transaction with UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }

    }

    async sendPayAttitudeRequest(terminal, withdrawalTerminal = null) {
        try {
          console.log("unpacked payattitude message", this.unpackedMessage.dataElements);
          let reqMsg = {};
          Object.assign(reqMsg, this.unpackedMessage.dataElements);
          let subFieldMessage = baseSubFieldMessage;
    
          if (withdrawalTerminal !== null) {
            reqMsg["18"] = "6011";
            reqMsg["53"] = null;
    
            reqMsg["41"] = withdrawalTerminal.terminalId;
            reqMsg["42"] = withdrawalTerminal.merchantId;
            reqMsg["43"] = "ITEX INTEGRATED SERVICES LIMITED      NG";
          }

          // let pinBlock = this.unpackedMessage.dataElements["52"];
    
          // const upslKeys =
          //   withdrawalTerminal !== null ? withdrawalTerminal : terminal;
    
          // const keysVersion = terminal.isVirtualTid === true ? "virtualtid" : 1;
    
          // if (pinBlock) {
          //   let nPinkey = ExtractKey.getDecryptedPinKey(
          //     terminal.pinKey_1,
          //     terminal.masterKey_1,
          //     keysVersion
          //   );
          //   let clearPinblock = Util.decrypt3DES(
          //     pinBlock,
          //     "hex",
          //     nPinkey,
          //     "hex",
          //     "hex"
          //   );
          //   // console.log(`clear pin ${clearPinblock}`);
    
          //   let uPinkey = ExtractKey.getDecryptedPinKey(
          //     this.upslDirectPinKey,
          //     this.upslDirectPinKey,
          //     "up"
          //   );
          //   let upPinblock = Util.encrypt3DES(
          //     clearPinblock,
          //     "hex",
          //     uPinkey,
          //     "hex",
          //     "hex"
          //   );
    
          //   console.log(`up pin: ${upPinblock}`);
          //   reqMsg["52"] = upPinblock;
          // }
    
          console.log("MTI => ", this.unpackedMessage.mti);
    
          // '62': '00698MP010133308069493993',
    
        //   reqMsg["2"] = "9501000000000001";
          reqMsg["3"] = "010000";
          reqMsg["15"] = "0107";
          // reqMsg["30"] = "0";
          reqMsg["32"] = "457714";
          reqMsg["33"] = "111111";
          reqMsg["35"] = "9501000000000001D3012";
          reqMsg["56"] = "1510";
          reqMsg["55"] = null;
          reqMsg["59"] = this.unpackedMessage.dataElements[90];
          reqMsg["90"] = null;
          reqMsg["60"] = null;
          reqMsg["62"] = null; //"00698MP0101333";
          reqMsg["98"] = null; //withdrawalTerminal.terminalId;
          reqMsg["100"] = "909111";
          reqMsg["103"] = "87001500"; //to account
          // reqMsg["108"] = this.unpackedMessage.dataElements[62]
          reqMsg["127"] = "1";
          reqMsg["128"] = null;

          let packedIso = this.ciso.packWithBinaryBitmap(this.unpackedMessage.mti, reqMsg);
          let hexIsoMessage = packedIso.isoMessageBytes.toString("hex");

          // remove the dummy D127 and it's length
          hexIsoMessage = hexIsoMessage.substr(0, hexIsoMessage.length - 14);

          //subfiled 127subFieldMessage["2"] = "5";
          subFieldMessage["2"] = this.unpackedMessage.dataElements["37"];
          subFieldMessage["3"] = "AGENCY4scr  UPVASsnk    029371784330DebitGroup  ";
          subFieldMessage["12"] = "SWTFBNsnk";
          subFieldMessage["13"] = "     000000   566";
          subFieldMessage["14"] = "FBN     ";
          subFieldMessage["20"] = "20220107";
          subFieldMessage[
            "22"
          ] = `<BufferB>${this.unpackedMessage.dataElements[62].substring(
            this.unpackedMessage.dataElements[62].length - 11
          )}</BufferB>`;
    
          subFieldMessage["25"] = null;
    
          let subIso = this.ciso.packSubFieldWithBinaryBitmap(subFieldMessage, config["127"].nestedElements);

          let subIsoHex = subIso.isoMessageBytes.toString("hex");
          let subFieldLength = subIsoHex.length / 2;
          let paddedLength = Util.padLeft(subFieldLength.toString(), 0, 6);
          let paddedLengthHex = Buffer.from(paddedLength, "utf8").toString("hex");

          // append 127 in hex to main iso message
          hexIsoMessage += paddedLengthHex;
          hexIsoMessage += subIsoHex;
    
          let bufferMsg = Buffer.from(hexIsoMessage, "hex");
    
          let binLength = Util.getLengthBytes(hexIsoMessage.length / 2);
    
          let requestMsg = Buffer.concat([binLength, bufferMsg]);
    
          console.log(requestMsg.toString("hex"), 'HEx MESS for payattitude');
    
          Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),
            `Final Unpacked Iso Message For Payattitude, : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} ${JSON.stringify(reqMsg.toString().substr(2))}`
          );

          let response = await this.sendSocketData(isoMsg);
          return response;
    
        //   this.client.write(requestMsg);
        } catch (error) {
          console.error(error.message);
          console.log(`error processing payattitude transaction with UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
          Util.fileDataLogger(this.terminalId, `error processing Payattitude transaction with UPSL for TID: ${this.terminalId}, at ${new Date()}, ${error}`);
          return false;
        }
      }

    async sendReversalTransactionRequest(terminal, withdrawalTerminal=null){
              
        try {

            // console.log("Withdrawal Terminal Object", withdrawalTerminal)

            let reqMsg = {};
            Object.assign(reqMsg,this.unpackedMessage.dataElements);
            //reqMsg["41"] = withdrawalTerminal !== null ? process.env.UP_WITHDRAWAL_TERMINALID : this.terminalId;;
            // reqMsg["42"] = terminal.upslKey.PARAM["03015"];
            if(withdrawalTerminal !== null) {
                reqMsg["18"] = "6010";
                reqMsg["41"] = withdrawalTerminal.terminalId;
                reqMsg["42"] = withdrawalTerminal.merchantId;
                reqMsg["43"] = process.env.UP_WITHDRAWAL_MERCHANTNAME;
                reqMsg["53"] = null;

            }

            reqMsg["56"] = '4021';
            reqMsg["95"] = "000000000000000000000000D00000000D00000000";
            reqMsg["90"] = Util.getReversalField90(this.unpackedMessage);
    
            let pinBlock = this.unpackedMessage.dataElements["52"];

            const upslKeys = withdrawalTerminal !== null ? withdrawalTerminal : terminal;

            const keysVersion = terminal.isVirtualTid === true ?  "virtualtid" : 1;

    
            if(pinBlock){
                let nPinkey = ExtractKey.getDecryptedPinKey(terminal.pinKey_1,terminal.masterKey_1, keysVersion);
                let clearPinblock = Util.decrypt3DES(pinBlock,"hex",nPinkey,"hex","hex");
                // console.log(`clear pin ${clearPinblock}`)
    
                let uPinkey  = ExtractKey.getDecryptedPinKey(upslKeys.upslKey.TPK,upslKeys.upslKey.TMK,"up");
                let upPinblock = Util.encrypt3DES(clearPinblock,"hex",uPinkey,"hex","hex");
    
                // console.log(`up pin: ${upPinblock}`);
                reqMsg["52"] = upPinblock;
            }
    
            // console.log(JSON.stringify(reqMsg));

    
    
            let tsk = ExtractKey.getDecryptedSessionKey(upslKeys.upslKey.TSK,upslKeys.upslKey.TMK,"up");
            let isoMsg = ExtractKey.rehashUnpackedIsoMessageUPLS("0420",reqMsg,this.ciso,tsk);
            let response = await this.sendSocketData(isoMsg);
            // console.log(JSON.stringify(this.ciso.unpack(response.toString().substr(2))))

            let unpackedResponse = this.ciso.unpack(response.toString().substr(2));

            // console.log("Response for reversal, ", Util.getResponseCode(unpackedResponse), Util.getNibssResponseMessageFromCode(unpackedResponse["39"]));

            return response;
    
        } catch (error) {
            console.log(`error processing reversal transaction with UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            Util.fileDataLogger(this.terminalId,`error processing reversal transaction with UPSL for TID : ${this.terminalId}, at ${new Date()}, ${error}`);
            return false;
        }

    }




    /**
     * send and await soocket message.
     * @param {String} reqMsg iso request message
     */
    async sendSocketData(reqMsg){

        //console.log("UPSL REQUEST DATA, ", reqMsg);

        //console.log(`upsl-req : ${reqMsg.toString("HEX")}`)
        let socketclient = new SocketClient(this.Ip,this.Port,false);
        let socketHandler = socketclient.startClient(reqMsg);

        let self = this;
        return new Promise(
            function (resolve, reject) {
                socketHandler.on('data', data => {
                    //console.log(`upsl response : ${data.toString('HEX')}`)
                    resolve(data);
                });
                socketHandler.on('error', err => {
                    //console.log(`upsl : ${err}`)
                    reject(err);
                });
            }

        );
    }
}

module.exports = UpslHandler;