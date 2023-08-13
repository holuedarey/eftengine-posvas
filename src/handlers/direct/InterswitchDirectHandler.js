const BaseHandler = require("../basehandler");
const Util = require('../../helpers/Util');
const TerminalKey = require('../../model/terminalkeysModel');

const InterswitchHandler = require('../interswitchHandler');
const ExtractKeys = require('../../helpers/ExtractKeys');



class InterswitchDirectHandler extends BaseHandler {


    constructor(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled = true, extralData) {

        super(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled, extralData);

        this.handlerUsed = Util.handlers.interswitch;

        this.vasData = extralData ? extralData["vasData"] || null : null;
        this.vas4Data = extralData ? extralData["vas4Data"] || null : null;
        this.receiptData = extralData ? extralData["ereceipt"] || null : null;
        this.remittaData = extralData ? extralData["remita"] || null : null;
        this.jambprcData = extralData ? extralData["jamb"] || null : null;
    
    }


    async process() {

            // get terminal keys from db
            let terminalId = Util.getTerminalId(this.unpackedMessage);
            let terminal = await TerminalKey.findTerminal(terminalId);
            let isVirtualTid = process.env.virtualTids.split(',').includes(terminalId);

            if (!terminal && !isVirtualTid) return;

            let initialSave = await this.saveInitialTransaction();
    
            if (initialSave === false) {
    
                response.error = true;
                response.message = "Unable to save initial transaction, aborting";
    
                console.error(`There was an error saving the initial transaction, aborting`);
                EmailNotifier.sendCriticalErrorAlert("There was an error saving the initial transaction, aborting");
            }
    
            if(isVirtualTid) {
    
                console.log("Getting keys for virtual tid, ", isVirtualTid)
    
                const keysArray = Util.extractVirtualTIDKeys(this.unpackedMessage);
    
                console.log(keysArray)
    
                terminal = {
                    masterKey_1: process.env.VIRTUALTIDMASTERKEY,
                    sessionKey_1: keysArray[1].substr(0, 32),
                    pinKey_1: keysArray[0]
                }
    
                console.log("virtual tid keys => ", terminal);
            }
    
    
            terminal.isVirtualTid = isVirtualTid;
    
    
            this.handle(terminal);
    
    }


    async handle(terminal) {

       //  try {
            let interswitchHandler = new InterswitchHandler(this.unpackedMessage, this.requestData, this.isoParser);
            let response;

            if(this.unpackedMessage.mti === "0200") {

                response = await interswitchHandler.sendTransactionRequest(this.unpackedMessage, terminal);

            } else if(this.unpackedMessage.mti === "0420") {

                response = await interswitchHandler.sendReversalRequest(this.unpackedMessage, terminal);
                
            } else {

                return false;

            }
    
    
            console.log("Response from INTERSWITCH");
            console.log(response);
    
            if (response) {
                this.handlerUsed = Util.handlers.interswitch;
    
                // this.unpackedHandlingServerMessage = this.isoParser.unpack(response.toString().substr(2));
                
                // this.transactionDetails.interSwitchResponse = Util.getResponseCode(this.unpackedHandlingServerMessage);
    
                this.transactionDetails.interSwitchResponse = response.resCode;

                console.log(`Interswitch response : ${response.resCode} at ${new Date().toString()}`);
                Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Interswitch response : ${response.resCode} at ${new Date().toString()}`);

                this.transactionDetails.authCode = response.authCode || '';

                // // use fail-over response as the responseCode
                // this.unpackedHandlingServerMessage.dataElements[39] = response.resCode;
                // this.unpackedHandlingServerMessage.dataElements[55] = response.iccResponse || null;

                let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
                let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponseFromInterswitch(this.requestData.toString(), clearSessionKey, this.isoParser, response, "direct");


                this.unpackedHandlingServerMessage = this.isoParser.unpack(rehashWithNibbs1Key.toString().substr(2));

                let initialSaveUpdate = await this.updateSavedTransaction();
    
                if (initialSaveUpdate === false) {
    
                    console.error(`There was an error updating the initially saved transaction, aborting`);
                    Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `There was an error updating the initially saved transaction, aborting`);
    
                }
    
       
                // return rehashWithNibbs1Key;

                // this.socketServerInstance.write(rehashWithNibbs1Key);

                await this.afterTransactionProcess(rehashWithNibbs1Key, this.socketServerInstance);

                this.socketServerInstance.end();
    
                this.handlerEvent.emit('complete', this.handlingModelInstance, this.transactionDetails);
        
    
            } else {

                await this.updateNoResponseTransaction("99", Util.getNibssResponseMessageFromCode("99"));
    
                this.socketServerInstance.end();
    
                this.handlerEvent.emit('noResponse', this.handlingModelInstance, this.transactionDetails);
                // this.handlerEvent.emit('e-receipt', this.receiptData, this.transactionDetails);
            }
    
        // } catch (error) {

        //     console.error(`There was an error processing transaction through interswitch, aborting`);
        //     Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `There was an error processing transaction through interswitch, aborting`);

            
        // }


    }


}

module.exports = InterswitchDirectHandler;