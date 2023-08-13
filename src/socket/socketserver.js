"use strict";

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const { constants } = require('crypto');

class SocketServer {

    constructor(port, tlsEnabled = false, tlsOptions = {}) {

        this.serverPort = port;
        this.tlsSocketOptions = {};
        this.tlsEnabled = tlsEnabled;

        if (tlsEnabled === true) {

            let defaulTLSSocketOptions = {

                // Necessary only if using the client certificate authentication
                key: fs.readFileSync(process.env.CERTIFICATES_KEY_PATH),
                cert: fs.readFileSync(process.env.CERTIFICATES_CRT_PATH),
                secureOptions: constants.SSL_OP_NO_TLSv1 | constants.SSL_OP_NO_TLSv1_1,
                // pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                // passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,

                // This is necessary only if using the client certificate authentication.
                //requestCert: true,

                // This is  only if the client uses the self-signed certificate.
                //ca: [ fs.readFileSync('client-cert.pem') ]

                minVersion : 'TLSv1'

            }

            this.tlsSocketOptions = { ...defaulTLSSocketOptions,
                ...tlsOptions
            }

        }

    }

    startServer() {

        let socketServer;

        if (this.tlsEnabled === true) {

            socketServer = tls.createServer(this.tlsSocketOptions);

        } else {

            socketServer = net.createServer();

        }

        socketServer.listen(this.serverPort, () => {

            console.log(`EFT Socket Server started and listening at ${this.serverPort}, TLS: ${this.tlsEnabled}`);

        });

        return socketServer;
    }

}

module.exports = SocketServer;