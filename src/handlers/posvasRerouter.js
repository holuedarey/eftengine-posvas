require("dotenv").config();

const SocketClient = require("../socket/socketclient");
const cISO8583 = require('../ciso8583/CISO');

class PosvasRouter{
    constructor(ip, port, tlsEnabled = true, socketServerInstance, requestData) {
        this.socketServerInstance = socketServerInstance;
        this.Ip = ip;
        this.Port = port;
        this.data = requestData;
        this.tlsEnabled = tlsEnabled;
    }

    async sendDataToPosVas(){
        if(process.env.handler === 'POSVAS_2') {
          console.log("sending to posvas app");
          let response = await this.sendSocketData(this.data);

          let iso8583Parser = new cISO8583();

          //Select and call handler class
          let unpackedMessage = iso8583Parser.unpack(response.toString().substring(2));
          console.log(unpackedMessage, 'from routing to posvas...');
          
          this.socketServerInstance.write(response);
          this.socketServerInstance.end();
          return response;
        }
    }

    async sendDataToPosVas2(){
      if(process.env.handler === 'POSVAS') {
        console.log("sending to posvas_2 app");
        let response = await this.sendSocketData(this.data);

        let iso8583Parser = new cISO8583();

        //Select and call handler class
        let unpackedMessage = iso8583Parser.unpack(response.toString().substring(2));
        console.log(unpackedMessage.dataElements, 'from routing to posvas2...');
        
        this.socketServerInstance.write(response);
        this.socketServerInstance.end();
        return response;
      }
  }

      /**
   * send and await soocket message.
   * @param {String} reqMsg iso request message
   */
  async sendSocketData(reqMsg) {
    let socketclient = new SocketClient(this.Ip, this.Port, true);

    let socketHandler = socketclient.startClient(reqMsg);

    let self = this;
    
    return new Promise(function (resolve, reject) {
      socketHandler.on("data", (data) => {
        console.log(`Posvas app response : ${data.toString()}`);
        resolve(data);
      });

      socketHandler.on("error", (err) => {
        console.log(`posvas_2 : ${err}`)
        reject(err);
      });

      socketHandler.on("timeout", () => {
        console.log(`posvas socket timedout`)
        reject('timeout error');
      });

    });
  }



}

module.exports = PosvasRouter;
