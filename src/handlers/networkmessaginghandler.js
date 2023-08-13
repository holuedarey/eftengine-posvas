require("dotenv").config();

const BaseHandler = require("../handlers/basehandler");

const NetworkMessagingEvent = require('../events/networkmessagingevent');

const Util = require('../helpers/Util');

const SocketClient = require('../socket/socketclient');

const ExtractKeys = require('../helpers/ExtractKeys');

class NetworkMessagingHandler extends BaseHandler {

    constructor(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled = true) {

        super(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled);

        this.handlerEvent = new NetworkMessagingEvent();

        // nibss 2 IP and Port for failover
        this.handlingServerIP2 = process.env.HANDLER_EPMS_2_PUBILC_IP;
        this.handlingServerPort2 = process.env.HANDLER_EPMS_2_TLS_PORT;
        this.unpackedServerMessage = null;

    }

    async updateTerminalState(){
        let newState = await ExtractKeys.saveCallhomeData(this.unpackedMessage);
        
        this.handlerEvent.emit('callhome',newState);
    }

    handleNissFailOverKeys() {
        ////// temporary for orangebox
        let orangebox_tid = process.env.orangebox_tids || "";
        let orangebox_tids = orangebox_tid.split(',');
        let terminalId = Util.getTerminalId(this.unpackedMessage);
        if (orangebox_tids.includes(terminalId)) {
            return;
        }
        ////// temporary for orangebox

        console.log(this.requestData.toString());
        //  change to true
        let theSocketClient2 = new SocketClient(this.handlingServerIP2, this.handlingServerPort2, true);
        
        let theSocketClientInstance2 = theSocketClient2.startClient(this.requestData);

        let handlingServerResponse2 = '';
        theSocketClientInstance2.on('data', async (res) => {

            if (process.env.APP_ENV == "local") {

                console.log(`Received Data from Nibss 2: ${res.toString()} from: ${theSocketClientInstance2.name}, TLS: ${true}`);

            }

            handlingServerResponse2 += res.toString('hex');
            if(handlingServerResponse2.length < 4)
                return;
            
            let length = Number.parseInt(handlingServerResponse2.substr(0,4),16);
            let handlingData = Buffer.from(handlingServerResponse2.substr(4),'hex').toString('utf8');
            if(handlingData.length < length)
                return;

            this.unpackedServerMessage = this.unpack(handlingData);

            if (process.env.APP_ENV == "local") {
                console.log("Response from the server handler");
                console.warn('unpacked data: \n' + JSON.stringify(this.unpackedServerMessage.dataElements[53]));

            }

            // check if the it's a Network Message
            let processingCode = Util.getProcessingCode(this.unpackedMessage);
            let terminalId = Util.getTerminalId(this.unpackedMessage);
            ExtractKeys.getTerminalKey(terminalId, this.unpackedServerMessage, processingCode, 2);


            theSocketClientInstance2.end();

        });

        theSocketClientInstance2.on('error', (error) => {
            console.error("error getting nibss 2 keys");
        })

        theSocketClientInstance2.on('close', () => {
            console.log('nibss 2 key request completed');
        });


    }
    

    async saveInitialTransaction() {

        // let saveDetails = {

        //     rrn: this.unpackedMessage.dataElements[37],
        //     onlinePin: (this.unpackedMessage.dataElements[52] !== null ? true : false),
        //     merchantName: this.unpackedMessage.dataElements[43].substring(0, 22),
        //     merchantAddress: this.unpackedMessage.dataElements[43].substring(23),
        //     merchantId: this.unpackedMessage.dataElements[42],
        //     terminalId: this.unpackedMessage.dataElements[41],
        //     STAN: this.unpackedMessage.dataElements[11],
        //     transactionTime: new Date(),
        //     merchantCategoryCode: this.unpackedMessage.dataElements[18],
        //     handlerName: this.handerName,
        //     MTI: this.unpackedMessage.mti,
        //     maskedPan: this.unpackedMessage.dataElements[2].substr(0, 6) + ''.padEnd(this.unpackedMessage.dataElements[2].length - 10, 'X') + this.unpackedMessage.dataElements[2].slice(-4),
        //     processingCode: this.unpackedMessage.dataElements[3],
        //     amount: parseInt(this.unpackedMessage.dataElements[4]),
        //     currencyCode: this.unpackedMessage.dataElements[49],
        //     messageReason: this.unpackedMessage.dataElements[56],
        //     originalDataElements: this.unpackedMessage.dataElements[90]

        // }

        // this.transactionDetails = { ...this.transactionDetails, ...saveDetails };

        console.log("Network Message Save");

        // console.log(this.transactionDetails);

        // this.handlingModelInstance = new this.handlingModel(saveDetails);

        // await this.handlingModelInstance.save().then(() => {

        //     console.log(`Saved Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);

        // })
        // .catch((error) => {

        //     console.log(`Exception Saving ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);

        // });

    }

    async updateSavedTransaction() {

        // let updateDetails = {

        //     responseCode: this.unpackedServerMessage.dataElements[39],
        //     authCode: this.unpackedServerMessage.dataElements[38],
        //     handlerResponseTime: new Date

        // }

        // this.transactionDetails = { ...this.transactionDetails, ...updateDetails };

        // let transactionID = this.handlingModelInstance.id;

        console.log("Updating Network Message");

        // console.log(this.transactionDetails);

        // await this.handlingModelInstance.set(updateDetails).save()
        // .then(() => {

        //     console.log(`Updated Transaction from Terminal: ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}`);

        // })
        // .catch((error) => {

        //     console.log(`Exception Updating ${this.transactionDetails.terminalId}, with RRN: ${this.transactionDetails.rrn}, Exception ${error}`);

        // });

    }

}

module.exports = NetworkMessagingHandler;