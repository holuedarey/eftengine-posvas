const BaseHandler = require('../basehandler');
const Util = require('../../helpers/Util');
const TerminalKey = require('../../model/terminalkeysModel');

const UpslHandler = require('../upslHandler');
const ExtractKeys = require('../../helpers/ExtractKeys');

class DirectUpslHandler extends BaseHandler {

    constructor(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled = true, extralData) {

        super(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled, extralData);

        this.handlerUsed = Util.handlers.upsl;

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

        // checking for virtual TIDS
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

            // console.log("Getting keys for virtual tid, ", isVirtualTid)

            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Getting Keys for UP Withdrawal, VTID: ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`);

            const keysArray = Util.extractVirtualTIDKeys(this.unpackedMessage);

            console.log(keysArray)

            terminal = {
                masterKey_1: process.env.VIRTUALTIDMASTERKEY,
                sessionKey_1: keysArray[1].substr(0, 32),
                pinKey_1: keysArray[0]
            }

            // console.log("virtual tid keys => ", terminal);
        }


        terminal.isVirtualTid = isVirtualTid;


        this.handle(terminal);

    }

    async handle(terminal) {
        let upslHandler = new UpslHandler(this.unpackedMessage, this.requestData, this.isoParser);
        let response;

        // console.log("withdrawal?", Util.checkUpslWithdrawal(this.unpackedMessage))

        let withdrawalTerminal = null;

        let transactionTerminalId = Util.getTerminalId(this.unpackedMessage);


        if(Util.checkUpslWithdrawal(this.unpackedMessage)) {

            const mappedUpTerminalForbankTid = Util.mapBankTerminalIdsToUPForWithdrawal(transactionTerminalId);

            console.log("Mapped terminalId", mappedUpTerminalForbankTid);

            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Mapped UPSL terminalId: ${mappedUpTerminalForbankTid} for ${Util.getTerminalForLog(this.unpackedMessage)} at ${new Date().toString()}`);

            withdrawalTerminal = await TerminalKey.findOne({ terminalId: mappedUpTerminalForbankTid});

            if(!withdrawalTerminal) return;

            const UPmerchantId = Util.mapUPTerminalsWithMIDs(mappedUpTerminalForbankTid);

            // We need the correct MID to do transaction successfully
            if(!UPmerchantId) return;

            withdrawalTerminal.merchantId = UPmerchantId;
            //withdrawalTerminal.merchantName = 'ITEX INTEGRATED SERVICES LIMITED'

            // console.log("Switched terminal for UP Withdrawal", JSON.stringify(withdrawalTerminal));

        }

        if(this.unpackedMessage.mti === "0100" && !isVirtualTid) {

            response = await upslHandler.sendBalanceEnquiryRequest(terminal);

        } else if (this.unpackedMessage.mti === "0200") {

            response = await upslHandler.sendTransactionRequest(terminal, withdrawalTerminal);

        } else if(this.unpackedMessage.mti === "0420") {

            response = await upslHandler.sendReversalTransactionRequest(terminal, withdrawalTerminal);

        } else {

            response = false;
            
        }

        // console.log("Response from UPSL");
        // console.log(response);

        if (response) {
            this.handlerUsed = Util.handlers.upsl;

            this.unpackedHandlingServerMessage = this.isoParser.unpack(response.toString().substr(2));
            this.transactionDetails.upslResponse = Util.getResponseCode(this.unpackedHandlingServerMessage);

            this.transactionDetails.upslTerminalIdUsed = withdrawalTerminal !== null ? withdrawalTerminal.terminalId : null;

            // let initialSaveUpdate = await this.updateSavedTransaction();

            // if (initialSaveUpdate === false) {

            //     console.error(`There was an error updating the initially saved transaction, aborting`);
            //     Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage), `There was an error updating the initially saved transaction, aborting`);

            // }

            const keysVersion = terminal.isVirtualTid === true ?  "virtualtid" : 1;


            let clearSessionKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, keysVersion);
            let rehashWithNibbs1Key = ExtractKeys.rehashIsoResponse(response.toString(), clearSessionKey);


            await this.afterTransactionProcess(rehashWithNibbs1Key, this.socketServerInstance);

            //this.socketServerInstance.write(rehashWithNibbs1Key);
          
            this.socketServerInstance.end();


            this.handlerEvent.emit('complete', this.handlingModelInstance, this.transactionDetails);


        } else {

            await this.updateNoResponseTransaction("99", Util.getNibssResponseMessageFromCode("99"));

            this.socketServerInstance.end();

            this.handlerEvent.emit('noResponse', this.handlingModelInstance, this.transactionDetails);
            // this.handlerEvent.emit('e-receipt', this.receiptData, this.transactionDetails);
        }



    }
}

module.exports = DirectUpslHandler;