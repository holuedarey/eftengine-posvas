"use strict";

require("dotenv").config();

const mongoose = require('mongoose');

const requireDir = require('require-dir');

const handlers = requireDir('./src/handlers');

const SocketServer = require("./src/socket/socketserver");

const SocketServerHandler = require("./src/socket/socketserverhandler");

const InterSwitchHandler = require('./src/handlers/interswitchHandler');

const UpslHandler = require('./src/handlers/upslHandler');

// const apiServer = require('./src/api/apiServer');
const AutoNotifications = require('./src/api/helpers/checkDatabase');

const CISO8583 = require('./src/ciso8583/CISO');


// firstbank report
const EmailNotifier = require('./src/notifications/notifiers/emailnotifier');
const CronJob = require('cron').CronJob;

const Util = require('./src/helpers/Util');
const Extractkeys = require("./src/helpers/ExtractKeys");

const {setupIo} = require('./src/socket/dataSocket');
const Http = require('http');




process.on('uncaughtException', (error) => {
    console.log(error.stack);
    Util.fileDataLogger('ErrorStack', JSON.stringify(error));
});

class Main {

    constructor() {
        

        process.on("uncaughtException",()=>{console.error("restart app");process.exit(1)})

        this.connectDatabase();

        this.setupPlainSocketServer();

        this.setupTLSSocketServer();

        this.setupInterswitch();

        this.setUpUpsl();

        this.runCronJob();

        // this.setupApiServer();
        
        if(process.env.APP_ENV == "local" && process.env.APP_DEBUG){
            // console.log("In play mode");
            // this.play();
            // let hash = Util.signIsoMessage("0234C94437611E6E474239ABA59221CE","0210F23C46D1ABE08200000000000000002116533477110900947400000000000000010004070820160820160820160407230480610510010012D000000000653347706528416335334771109009474D2304221011164998000407082016552212033GP23203315000006045ITEX INTERGRATED SER   LA           LANG566032910A8AE9218808EBFB1300005F3401-1015510101511344101")
            // Util.hexToBytes('40F27679E6F75786B97661FE3DFE3B1F')
        }
        // let id = "fbn-discount";
        // let reg = new RegExp(`^${id}`);
        // console.log(reg.source);

        // let key = Util.xorHexString(process.env.LIVE_KEY_1,process.env.LIVE_KEY_2);
        // console.log(key);
        // let clearMasterKey = Util.decrypt3DES("B12E478FD0F0344B64EB43FFFAE36E95",'hex',key,'hex','hex');
        // console.log(clearMasterKey);
        // let clearSessionKey = Util.decrypt3DES("C9C290A4BA3E99A2895750B6D07C8783",'hex',clearMasterKey,'hex','hex');
        // console.log(clearSessionKey);
        // let hash = Util.signIsoMessage(clearSessionKey,"0200F23C46D129E08200000000000000002116469666000014785200000000000000010004090347570347570347570409211180610510000012D0000000006469666374696660000147852D211122613073304000000004090347572262033GP23203315000006045ITEX INTERGRATED SER   LA           LANG5662129F26080DC661FAF6A88E469F2701809F3303E0F8C85F3401009F3501229F34034103029F100706010A03A4A9009F3704F20559C19F360205BE950502000000009A031904099C01009F02060000000001005F2A02056682025C009F1A0205669F1E083131373030303231015510101511344101");
        // console.log(hash);
        // let l = "0810023800000280000504101057040000021057040410002033GP2312302014201904101057040301520331500000604504002600500356606003566070020152040ITEX INTERGRATED SER   LA           LANG0800480619B40853F0E99583C9E4130EBD8C0223A0DC8E28477894F6467E85286D7D3047F".length.toString();
        // let len =   400;
        // let ss = Ext.getDecryptedSessionKey("283804DBCB5BC1D37443F6A7FF73AF4E","82C38C57878A69F8B8162B0EC1228CC9",false);
        // // Util.getLengthBinary("0200F23C46D129E08200000000000000002116469666000014785200000000000000010004101238541238541238540410211180610510000012D0000000006469666374696660000147852D211122613073304000000004101238542262033GP23203315000006045ITEX INTERGRATED SER   LA           LANG5662129F26080B85CF0FDF6D40349F2701809F3303E0F8C85F3401009F3501229F34034103029F100706010A03A4A9009F3704C6C426D49F360205C2950502000000009A031904109C01009F02060000000001005F2A02056682025C009F1A0205669F1E083131373030303231015510101511344101B4DA25E8A0B1F1F29AE37D153CFEE0E1C3FE8C9C1790AC8AC96582B1DAB4EE03".length);
        // let newHash = Ext.rehashIsoMessage("☺�0210F23C46D1AFE08200000000000000002116469666000014785200000000000000010004100114470114470114470410211180610510000012D000000000646966606457837374696660000147852D21112261307330400000000410011447916912002262033GP23203315000006045ITEX INTERGRATED SER   LA           LANG566032910A99F7FE70C640F96730305F3401-1015510101511344101963DCB1C9855915B12185CCBC6FB2CC498FE4AEB4D59BFA36690E62779BD5345",ss);
        // console.log(newHash);
        // console.log(new Buffer(len.toString(16),'hex'));
        // // console.log(String.fromCharCode(2));
        // console.log(String.fromCharCode(30));
        // let d = 400 & 0xFF;
        // let c = 400 >> 8;
        // console.log("----");
        // console.log(c);
        // console.log(d);
        // console.log('hex '+len.toString(16))
        // console.log(String.fromCharCode(c));
        // console.log(String.fromCharCode(d));
        // console.log("----");
        // Util.decrypt();
        // Util.dect();
        // let TPC = Util.getTamsTransactionType('00');
        // console.log(TPC);
        // let tams = new TamsHandler({},{},false);
        // tams.getTamsMasterKey("20390022");
        // tams.getTamsSessionKeys('2033GP23')

        // let dd = Util.decryptTamsSessionKeys1("e0780c5d4ff058edaeeeb6ec8f5704af","hex","71ff75ab0ee710ecb5613b50bbff6d59","2033GP23","1a95a365642c185220fb5c12e658d85b","hex");
        // console.log(dd);

        // // let k2 = Util.decryptTamsSessionKeys2("4e96ebb3f1d5f65293061ecacd3a3e22","2fecee1c4e85c767f3fb578439479ec7","hex","480eb0d3ce2f1cd07cccbc8fe6ee562c","2033GP23","1a95a365642c185220fb5c12e658d85b","hex");
        // // console.log(k2);
        // let requestData = `1233542415`;
        // let signedData = Util.doSha256(dd, requestData);
        // console.log(signedData);
        // console.log(Number.parseInt("000000000100"));
        // Util.mapICCData({});
        // let ksn = Number((new Date).getTime()).toString(16).toUpperCase();
        // while(ksn.length < 20)
        //  ksn = 'F' + ksn;
        // console.log('3C283035D2FCACD29663A31D2B8BD23C'.toUpperCase());
    
        // let dd = Util.encrypt3DES("4696660000147852D21112261307330400000",'ascii',"bc3866959eb0f2d64f81f480c50e2303",'hex','hex');
        // console.log(dd);

        // console.log("3c283035d2fcacd29663a31d2b8bd23c".toUpperCase());
        // let pin = "9AB9FFBA3B61F49B";
        // let dmmyPin = pin.substr(0,8);
        // console.log(dmmyPin);
        // console.log(Buffer.from(dmmyPin,'utf8').toString('hex'));
        // let ksn = Buffer.from("2033GP2300000001"); 
        // console.log(`>>${Buffer.from("2033GP2300000001","hex").toString("binary")}`);

        // console.log(Buffer.from("9AB9FFBA3B61F49B").toString('binary'));
        // console.log(Util.decrypt3DES("5b11260d2eed790c975b25a4c6a7a497","hex","11111111111111111111111111111111","hex","hex"))
    }

    connectDatabase() {

        const {
            databaseDriver,
            databaseHost,
            databasePort,
            databaseUser,
            databasePwd,
            databaseCollection,
            databaseHost_2,
            databasePort_2,
            databaseHost_3,
            databasePort_3,
            replicaSet
        } = {

            databaseDriver: process.env.DATABASE_DRIVER || 'mongodb',
            databaseHost: process.env.DATABASE_HOST || 'localhost',
            databasePort: process.env.DATABASE_PORT || '27017',
            databaseUser: process.env.DATABASE_USER || 'eft-user',
            databasePwd: process.env.DATABASE_PWD || '4839!!Itex',
            databaseCollection: process.env.DATABASE_COLLECTION || 'eftEngine',

            databaseHost_2: process.env.DATABASE_HOST_2 || 'localhost',
            databasePort_2: process.env.DATABASE_PORT_2 || '27017',

            databaseHost_3: process.env.DATABASE_HOST_3 || 'localhost',
            databasePort_3: process.env.DATABASE_PORT_3 || '27017',

            replicaSet: process.env.REPLICA_SET_NAME || 'rs1'

        }

        if (process.env.APP_ENV == "local" && process.env.APP_DEBUG) {

            console.log(`Database Connection: ${databaseDriver}://${databaseUser}:${databasePwd}@${databaseHost}:${databasePort}/${databaseCollection}`, {
                useNewUrlParser: true
            });


        }



        mongoose.Promise = global.Promise;
        // mongoose.connect(`${databaseDriver}://${databaseUser}:${databasePwd}@${databaseHost}:${databasePort},${databaseHost_2}:${databasePort_2},${databaseHost_3}:${databasePort_3}/${databaseCollection}?authSource=admin`, {
        mongoose.connect(`${databaseDriver}://${databaseUser}:${databasePwd}@${databaseHost}:${databasePort}/${databaseCollection}`, {
            useNewUrlParser: true,
            // sets how many times to try reconnecting
            reconnectTries: Number.MAX_VALUE,
            // sets the delay between every retry (milliseconds)
            reconnectInterval: 1000,
            autoReconnect : true,
            autoIndex: true,
            numberOfRetries : 5,
            // replset name
            // replicaSet
             
        },(err)=>{

            console.log("Had an Error: ", err);
            // this.setUpEmailCron();

            // this.setUpDataSocket();
        });

    }

    setupPlainSocketServer() {

        let plainSocketServer = new SocketServer(process.env.SOCKET_SERVER_PORT_PLAIN, false);

        let plainSocketServerInstance = plainSocketServer.startServer();

        let plainSocketServerHandler = new SocketServerHandler(handlers, plainSocketServerInstance, false);

        plainSocketServerHandler.handleSocketServerInstance();
    }

    setupTLSSocketServer() {

        let tlsSocketServer = new SocketServer(process.env.SOCKET_SERVER_PORT_TLS, true);

        let tlsSocketServerInstance = tlsSocketServer.startServer();

        let tlsSocketServerHandler = new SocketServerHandler(handlers, tlsSocketServerInstance, true);

        tlsSocketServerHandler.handleSocketServerInstance();

    }

    setUpEmailCron() {
        let sendMail = process.env.enable_email_cron == 'y' ? true : false;

        if (sendMail) {
            new CronJob(process.env.cronConfig, async function () {

                let emailnotifier = new EmailNotifier();
                await emailnotifier.sendReports();

            }, null, true, 'Africa/Lagos');
        }

    }

    setupInterswitch() {
        if(process.env.ENABLE_INTERSWITCH_CONN == 'y')
        {
            new CronJob(process.env.Interswitch_Signon_Cron, function () {
                let interswitchHandler = new InterSwitchHandler();
                interswitchHandler.signOnRequest();
            }, null, true, 'Africa/Lagos', null, true);
        }

        if(process.env.ENABLE_INTERSWITCH_FAILOVER_CONN == 'y')
        {
            // new CronJob(process.env.Interswitch_Signon_Cron, function () {
            let interswitchHandler = new InterSwitchHandler();
            interswitchHandler.failOversignOnRequest(true).then(failoverResponse => {
                console.log(failoverResponse.toString(), 'got back from sign on request');
            }).catch(e => {
                console.log(e, 'ERror at sign on request');
            });
            interswitchHandler.failoverKeyExchangeRequest(true).then(echoDataResponse => {
                console.log('Reply for ECHO Data', echoDataResponse);
            }).catch(e => {
                console.log(e.message, 'Error at key Exchange');
            });
            new CronJob('*/4 * * * *', function () {
                interswitchHandler.failOverPollingMessage(true).then(failoverPollingResponse => {
                    console.log(failoverPollingResponse.toString(), 'got back from sign on request');
                }).catch(e => {
                    console.log(e, 'ERror at sign on request');
                });
            }, null, true, 'Africa/Lagos');
        }


    }

    setUpUpsl() {


        const terminalIds = process.env.UPSL_WITHDRAWAL_TERMINAL_IDS.split(',');

        if(process.env.ALLOW_UPSL_PREP == 'y')
        {
            const ciso = new CISO8583();

            for (let terminalId of terminalIds) {

                const unpackedIsoRequest = Extractkeys.prepareIsoRequestForKeyExchange('9A', terminalId, ciso);

                const upslHandler = new UpslHandler(unpackedIsoRequest.unpackedMessage, null, ciso);
    
                upslHandler.prepTerminal();

            }

        }

    }


    setupApiServer() {
        // let apiport = process.env.API_PORT || 2000;
        // apiServer.listen(apiport,()=>{
        //     console.log(`EFT API Server started and listening at ${apiport}`)
        // })
    }

    setUpDataSocket(){
        let live_data_port = process.env.LIVE_DATA_PORT;
        if(!live_data_port) return;

        let http = Http.createServer();
        setupIo(http).then(()=>{
            console.log(`Data IO Started`);
        })
        http.listen(live_data_port);
        console.log(`live data socket starting and listening on PORT ${live_data_port} at ${new Date().toString()}`);
    }

    runCronJob(){
        let verifyAutoNotifier = process.env.enable_auto_notification_cron == 'y' ? true : false;
        if (verifyAutoNotifier) {
            new CronJob(process.env.autoCronConfig, async function () {
                let notifierInstance = new AutoNotifications();
                await notifierInstance.sendNotifications();
            }, null, true, 'Africa/Lagos');
        }
    }

}

let bootApplication = new Main();