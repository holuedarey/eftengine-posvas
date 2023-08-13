/**
 * @author Abolaji
 * handles requery from POS
 */
require('dotenv').config();
const Journal = require('../model/journalmodel');
const Util = require('../helpers/Util');
const TerminalKey = require('../model/terminalkeysModel');
const ExtractKeys = require('../helpers/ExtractKeys');
const SocketClient = require('../socket/socketclient');


class RequeryHandler {

    constructor(socketServerInstance, isoParser, requestData, unpackedMessage) {

        console.log(`Requery Request Received rrn: ${Util.getRRN(unpackedMessage)}, Terminal Id ${Util.getTerminalId(unpackedMessage)} at ${new Date().toString()}`);
        Util.fileDataLogger(Util.getTerminalForLog(unpackedMessage),`Requery Request Received rrn: ${Util.getRRN(unpackedMessage)}, Terminal Id ${Util.getTerminalId(unpackedMessage)} at ${new Date().toString()}`);

        this.socketServerInstance = socketServerInstance;
        this.isoParser = isoParser;
        this.requestData = requestData;
        this.unpackedMessage = unpackedMessage;

        // this.handlerNam

        this.handlingServerIP = process.env.HANDLER_EPMS_IP;
        this.handlingServerPort = process.env.HANDLER_EPMS_TLS_PORT;

        this.nibss2ServerIP = process.env.HANDLER_EPMS_2_PUBILC_IP;
        this.nibss2ServerPort = process.env.HANDLER_EPMS_2_TLS_PORT;
    }


    async process() {
        let rrn = Util.getRRN(this.unpackedMessage);
        let terminalId = Util.getTerminalId(this.unpackedMessage);
        let terminal = await TerminalKey.findTerminal(terminalId);
        if (terminal) {

            // get the journal and process reversal
            let result = await this.processRequery(rrn, terminal);

            // if host hasn't responded yet, wait 6 seconds before checking again
            if (result == false) {
                let self = this;
                let counter = 0;
                let timer = setInterval(async () => {
                    counter = counter + 1;

                    try {
                        result = await self.processRequery(rrn, terminal);
                        if (result == true || counter >= 10) {
                            self.socketServerInstance.end();
                            clearInterval(timer);
                            console.log(`Timer Closed`);
                            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Timer Closed`);
                        }
                    } catch (error) {
                        console.error(`error requering ${error.toString()} at ${new Date().toString()}`);
                        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`error requering ${error.toString()} at ${new Date().toString()}`);

                        if (timer) {
                            clearInterval(timer);
                        }
                    }
                    
                }, 5000);
            }

        } else {
            console.error(`Requery terminated, terminal ${terminalId} not found, RRN ${rrn}`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Requery terminated, terminal ${terminalId} not found, RRN ${rrn}`);
            this.socketServerInstance.end();
        }

    }


    async processRequery(rrn, terminal) {
        let journal = await Journal.findOne({
            terminalId: terminal.terminalId,
            rrn: rrn,
            maskedPan : Util.getMaskPan(this.unpackedMessage),
            amount : Util.getAmount(this.unpackedMessage),
            customerRef : Util.getCustomerRefData(this.unpackedMessage)
        });

        // break out and close socket if journal not found
        if (!journal) {
            this.socketServerInstance.end();
            return true;
        }

        console.log(`Requeried Transaction ${journal}`);
        Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Requeried Transaction ${journal}`);

        if (journal.responseCode != null && journal.responseCode != undefined) {

            let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
            let responseCode = journal.responseCode;

            console.log(`Processing Requery Request rrn: ${Util.getRRN(this.unpackedMessage)}, Terminal Id ${Util.getTerminalId(this.unpackedMessage)}, Response Code ${responseCode} at ${new Date().toString()}`);
            Util.fileDataLogger(Util.getTerminalForLog(this.unpackedMessage),`Processing Requery Request rrn: ${Util.getRRN(this.unpackedMessage)}, Terminal Id ${Util.getTerminalId(this.unpackedMessage)}, Response Code ${responseCode} at ${new Date().toString()}`);

            // 99 and 100 are my custom responseCode for noresponse and timeout respectively
            if (!["99", "100"].includes(responseCode)) {
                console.log("response")
                let data = ExtractKeys.rehashIsoRequeryResponse(this.requestData.toString(), hashKey, this.isoParser, journal, responseCode);
                this.socketServerInstance.write(data);
                console.warn(`Requery Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`, Util.truncateData(data.toString()));
                console.log(`Requery Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`, Util.truncateData(data.toString()));

            } else if(["99", "100"].includes(responseCode)){
                console.log("No response")
                let data = ExtractKeys.rehashIso06ResponseCode("0211",this.requestData.toString(), hashKey, this.isoParser, journal, "06");
                this.socketServerInstance.write(data);

                console.warn(`Requery Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`, Util.truncateData(data.toString()));
                console.log(`Requery Data written to POS :%s Terminal : ${Util.getTerminalId(this.unpackedMessage)}, RRN: ${Util.getRRN(this.unpackedMessage)} at ${new Date().toString()}`, Util.truncateData(data.toString()));

                console.warn(`Request Reversal for Requery rrn: ${Util.getRRN(this.unpackedMessage)}, Terminal Id ${Util.getTerminalId(this.unpackedMessage)}, Response Code ${responseCode} at ${new Date().toString()}`);
                this.handleReversal(terminal,journal);
            }
            
            this.socketServerInstance.end();
            console.log(`Requery Request Processed rrn: ${Util.getRRN(this.unpackedMessage)}, Terminal Id ${Util.getTerminalId(this.unpackedMessage)} at ${new Date().toString()}`);
            return true;
        }
        return false
    }

    handleReversal(terminal,journal) {
        console.log(`Requery Request Processed rrn: ${Util.getRRN(this.unpackedMessage)}, Terminal Id ${Util.getTerminalId(this.unpackedMessage)} at ${new Date().toString()}`);

        if (journal.handlerUsed == Util.handlers.nibss1) {
            let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_1, terminal.masterKey_1, 1);
            this.handleNibssReversals(hashKey,journal,terminal);
        }else if(journal.handlerUsed == Util.handlers.nibss2){
            let hashKey = ExtractKeys.getDecryptedSessionKey(terminal.sessionKey_2, terminal.masterKey_2, 2);
            this.handleNibssReversals(hashKey,journal,terminal);
        }
    }


    handleNibssReversals(hashKey,journal,terminal) {
        console.log(`Processing Reversal Request for requeried rrn: ${Util.getRRN(this.unpackedMessage)}, Terminal Id ${Util.getTerminalId(this.unpackedMessage)} at ${new Date().toString()}`);
        let reversalRequestData = ExtractKeys.reshashIsoMessageForRequeryReversal(this.requestData.toString(), hashKey, this.isoParser,journal,terminal);
        let reversalModel;
        Journal.SaveReversalRequest(this.isoParser.unpack(reversalRequestData.toString().substr(2)), journal.handlerUsed, (err, res) => {
            if (err)
                console.error(`Error saving reversal request data: ${err.toString()}`)
            else {
                console.log(`Processing NIBSS Reversal at ${new Date().toString()}`);
                console.log(res);
                reversalModel = res;
            }

        });

        if(journal.handlerUsed == Util.handlers.nibss2){
            this.handlingServerIP = this.nibss2ServerIP;
            this.handlingServerPort = this.nibss2ServerPort;
        }
        let reversalClient = new SocketClient(this.handlingServerIP, this.handlingServerPort, true);
        let reversalClientInstance = reversalClient.startClient(reversalRequestData);
        let response = '';

        reversalClientInstance.on('data', async (data) => {

            response += data;
            if (response.toString().length < 3)
                return

            let unpackRes = this.isoParser.unpack(response.toString().substr(2));

            if (reversalModel) {

                reversalModel.messageReason = Util.getNibssResponseMessageFromCode(unpackRes.dataElements[39]),
                    reversalModel.responseCode = unpackRes.dataElements[39],
                    reversalModel.authCode = unpackRes.dataElements[38],
                    reversalModel.handlerResponseTime = new Date

                Journal.updateReversalResponse(reversalModel, (err, res) => {
                    if (err)
                        console.error(`Error updating reversal response data: ${err.toString()}`)
                    else {
                        console.log('Reversal before fail-over completed');
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

}

module.exports = RequeryHandler;