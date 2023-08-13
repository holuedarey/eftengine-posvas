const BaseHandler = require("./basehandler");
const SocketClient = require('../socket/socketclient');
const Util = require('../helpers/Util');



class InterswitchRerouteHandler extends BaseHandler {

    constructor(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled = true, extra) {

        super(socketServerInstance, isoParser, requestData, unpackedMessage, tlsEnabled, extra);

        // ISW Reroute IP and Port for failover
        this.Ip = process.env.ISW_REROUTE_IP;
        this.Port = process.env.ISW_REROUTE_PORT;
        this.unpackedServerMessage = null;
        this.extra = extra;

    }

    async process() {

        this.extra["mw_handler"] = process.env.handler;

        let request = Buffer.concat([Buffer.from(this.requestData),
            Buffer.from(JSON.stringify(this.extra), "utf8")]);

        let decLength =  request.toString("hex").length/2;
        let length = Util.getLengthBytes(decLength);


        let response = await this.sendSocketData(Buffer.concat([length, request]));

        this.socketServerInstance.write(response);

        return response;


    }

        /**
     * send and await soocket message.
     * @param {String} reqMsg iso request message
     */
    async sendSocketData(reqMsg){

        let socketclient = new SocketClient(this.Ip,this.Port,true);
        let socketHandler = socketclient.startClient(reqMsg);

        let self = this;
        return new Promise(
            function (resolve, reject) {
                socketHandler.on('data', data => {
                    console.log(`interswitch response : ${data.toString('HEX')}`)
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

module.exports = InterswitchRerouteHandler;