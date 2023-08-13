require("dotenv").config();

const crypto = require('crypto');

const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const moment = require('moment');

class OyoStateInstitutionNotifier {

    constructor(notificationData, options = {}) {

        this.notificationData = notificationData;
        this.options = options;

    }

    signRequest(toHash, secret) {
    
       let hash = crypto.createHash('sha512');

        hash.update(toHash + secret);
         
        return hash.digest('hex');

    }

    saveTransactionId() {

        console.log("Transaction Data, ", JSON.stringify(this.notificationData));

        let customerRef = this.notificationData.customerRef.split('~');

        if(customerRef.length < 2) return false;

        let customTransactionId = customerRef[1];

        return new Promise((resolve, reject) => {

            Journal.updateOne({rrn: this.notificationData.rrn,
                customerRef: this.notificationData.customerRef,
                terminalId: this.notificationData.terminalId
            }, {$set : { customTransactionId }},(err,data)=>{
                if(err) {
                    console.error(`error updating Oyo state Institution transaction Id result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    
                     Util.fileDataLogger(this.notificationData.terminalId,`error updating  Oyo state Institution transaction Id notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
                    
                     resolve(false);
    
                } else {
        
                    console.log(` Oyo state Institution transaction Id updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
    
                    Util.fileDataLogger(this.notificationData.terminalId,` Oyo state Institution transaction Id notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
    
                    resolve(true);
    
                }
            });
    

        });


    }

}

module.exports = OyoStateInstitutionNotifier;