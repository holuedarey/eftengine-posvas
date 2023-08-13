"use strict";

const net = require('net');
const tls = require('tls');
const fs = require('fs');

class SocketClient {

    constructor(host, port, tlsEnabled = false, tlsOptions = {}) {

        this.serverHost = host;
        this.serverPort = port;
        this.tlsSocketOptions = {};
        this.tlsEnabled = tlsEnabled;

        if (this.tlsEnabled === true) {

            let defaulTLSSocketOptions = {

                host: this.serverHost,
                port: this.serverPort,
                rejectUnauthorized: false,

                // Necessary only if using the client certificate authentication
                // key: fs.readFileSync(process.env.CERTIFICATES_KEY_PATH),
                // cert: fs.readFileSync(process.env.CERTIFICATES_CRT_PATH),
                pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE

                // This is necessary only if using the client certificate authentication.
                //requestCert: true,

                // This is  only if the client uses the self-signed certificate.
                //ca: [ fs.readFileSync('client-cert.pem') ]

            }

            this.tlsSocketOptions = { ...defaulTLSSocketOptions,
                ...tlsOptions
            }



        }

    }

    /**
     * 
     * @param {*} defaultMessage data to be sent
     * @param {*} timeout request timeout
     * //Increase the timeout.
     */
    startClient(defaultMessage = null, timeout=40000) {

        let socketClient;

        socketClient = new net.Socket();

        if (this.tlsEnabled === true) {

            socketClient = new tls.TLSSocket();

        }

        socketClient.setTimeout(timeout);

        socketClient.connect(this.serverPort, this.serverHost, this.tlsSocketOptions, () => {

            console.log(`EFT Socket Client ready and connected to ${this.serverHost}:${this.serverPort}, TLS: ${this.tlsEnabled}`);
            
            if (defaultMessage !== null) {

                // console.log('defaultMessage: '+defaultMessage.toString('hex'))

                socketClient.write(defaultMessage);
                
            }


        });

        socketClient.on('close', (hadError) => {

            console.log(`Socket Client Closed, HadError: ${hadError}`);

        });

        socketClient.on('end', (socket) => {

            console.log(`Socket Client Ended`);

        });

        socketClient.on('error', (error) => {

            console.log(`Socket Client Error, Error: ${JSON.stringify(error)}`);

        });

        return socketClient;
    }

}

module.exports = SocketClient;