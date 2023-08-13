const EventEmitter = require('events');
require('dotenv').config()
const Notifier = require('../notifications/basenotification');
const GeneralNotifier = require('../notifications/generalnotification');
const EReceiptNotifier = require('../notifications/ereceiptnotification');
const {sendSocketNotification,socketDataType} = require('../socket/dataSocket');

const SummaryHandler = require('../handlers/summaryhandler');
const Util = require('../helpers/Util');
const NetworkUtil = require('../helpers/NetworkUtil');


class TransactionEvent extends EventEmitter {

    constructor(){

        super();

        this.on('complete', (transactionJournal, details) => {

            setImmediate(() => {
                
                console.log(`New Transaction Processed`);

                //Send out notifications
                if(transactionJournal.write2pos == '06'){
                    console.error(`Abort notification, Unable to Write to POS, rrn : ${details.rrn}, TID : ${details.terminalId}, at ${details.transactionTime}`);
                    Util.fileDataLogger(details.terminalId,`Abort notification, Unable to Write to POS, rrn : ${details.rrn}, TID : ${details.terminalId}, at ${details.transactionTime}`);
                    
                    return;
                }

                //send B2B notifications flutter|remita e.t.c.
                let theNotification = new Notifier("transaction", transactionJournal, details);
                theNotification.sendNotifications();
                

                // send generate email notification to merchants
                let config = process.env.sendNotification == 'true' ? true : false;
                if (config) {
                    let generalNotifier = new GeneralNotifier(transactionJournal);
                    generalNotifier.sendNotification();
                }

                // write transaction summary
                if(transactionJournal.MTI == '0200'){
                    sendSocketNotification(socketDataType.journal,transactionJournal);

                    SummaryHandler.updateBankStatistics(details);
                    SummaryHandler.updateMerchantStatistics(details);

                    NetworkUtil.sendLoyalityRequest(details)

                }


            });

            //Handle Other processes and notifications

        });

        this.on('noResponse',(transactionJournal, details)=>{
            
        });

        this.on('e-receipt',(receipt,journal)=>{
            setImmediate(()=>{
                // send ereceipt
                let config = process.env.send_ereceipt == 'true' ? true : false;
                if (config && receipt) {
                    let ereceipt = new EReceiptNotifier(receipt,journal);
                    ereceipt.sendNotification().then(()=>console.log(`new e-receipt`)).catch((err)=>console.error(`new e-receipt error ${err}`));
                }
            })
        })

    }

}

module.exports = TransactionEvent;