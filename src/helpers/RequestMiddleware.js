/**
 * @author Abolaji
 */
require('dotenv').config();
const Util = require('../helpers/Util');
const RegisterServices = require('../model/registerednotificationmodel');
const GtbMonitorConfig = require('../config/gtbmonitorConfig.json');
const gtbankMIDS = require("../config/gtbankMids.json");
const migratedList = require('../config/migrated.json');


 module.exports = {


    async checkIfGtbankTerminalValidTransactionAmount(unpackedMessage) {

        let amount = Util.getAmount(unpackedMessage);
        let merchantId = Util.getMerchantId(unpackedMessage);


        return (gtbankMIDS.includes(merchantId) && parseInt(amount) > parseInt(process.env.GTBANKMAXAMOUNT));
    },

    
    async checkIfNIPCOTerminalValidTransactionAmount(unpackedMessage) {

        let amount = Util.getAmount(unpackedMessage);
        let merchantId = Util.getMerchantId(unpackedMessage);
        let nipcoMids = process.env.NIPCOMIDS.split(",");


        return (nipcoMids.includes(merchantId) && parseInt(amount) > parseInt(process.env.NIPCOMAXAMOUNT));
    }, 

    /**
     * check if the pos is permitted to use providus application
     * @param {Object} unpackedMessage unpacked message from pos
     */
    async checkProvidusRequest(unpackedMessage){

        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef)
            return true;
        
        if(!customerRef.startsWith(process.env.providus_identifier))
            return true;

        let terminalId = Util.getTerminalId(unpackedMessage);
        let terminal = await RegisterServices.findOne({terminalId : terminalId, name : {$regex: /\bProvidus/}});
        if(!terminal)
            return false;

        
        
        return true;    
    },

    /**
     * check if the pos is permitted to use providus application
     * @param {Object} unpackedMessage unpacked message from pos
     */
    async checkFrscRequest(unpackedMessage){

        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef)
            return true;
        
        if(!customerRef.startsWith(process.env.frsc_identifier))
            return true;

        let terminalId = Util.getTerminalId(unpackedMessage);
        let terminal = await RegisterServices.findOne({terminalId : terminalId, name : {$regex: /\bFRSC/}});
        if(!terminal)
            return false;

        
        
        return true;    
    },
    /**
     * check if the pos is permitted to use providus application
     * @param {Object} unpackedMessage unpacked message from pos
     */
    async checkSterlingRequest(unpackedMessage){

        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef)
            return true;
    
        // console.log("Passed check for Sterling Request: ", customerRef.startsWith(process.env.frsc_str_identifier));
        
        
        if(!customerRef.startsWith(process.env.frsc_str_identifier))
            return true;

        let terminalId = Util.getTerminalId(unpackedMessage);


        let terminal = await RegisterServices.findOne({terminalId : terminalId, name : {$regex: /\bFRSC/}});
        if(!terminal)
            return false;

        

        console.log("Passed check for Sterling Request");
        
        return true;    
    },

    /**
     * validate GTB monitor request and if pos is permitted
     * @param {Object} unpackedMessage unpacked message from POS
     */
    checkGtbMonitorRequest(unpackedMessage){
        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef){ 
            return true;
        }

        if(!customerRef.startsWith(GtbMonitorConfig.identifier)){
            return true;
        }

        let terminalId = Util.getTerminalId(unpackedMessage);
        if(customerRef.startsWith(GtbMonitorConfig.identifier) && !GtbMonitorConfig.terminals.includes(terminalId)){
            return false;
        }
        
        return true;
    },

    async checkExchangeboxRequest(unpackedMessage){
        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef){ 
            return true;
        }

        let identifier = process.env.exhangebox_identifier;
        if(!customerRef.startsWith(identifier)){
            return true;
        }

        let terminalId = Util.getTerminalId(unpackedMessage);
        let terminal = await RegisterServices.findOne({terminalId : terminalId});
        if(customerRef.startsWith(identifier) && !terminal){
            return false;
        }
        
        return true;
    },

    // async checkRsuthRequest(unpackedMessage){
    //     let customerRef = Util.getCustomerRefData(unpackedMessage);
    //     if(!customerRef){ 
    //         return true;
    //     }

    //     let identifier = process.env.rsuth_identifier;
    //     if(!customerRef.startsWith(identifier)){
    //         return true;
    //     }

    //     let terminalId = Util.getTerminalId(unpackedMessage);
    //     let terminal = await RegisterServices.findOne({terminalId : terminalId, name : {$regex: /\bRsuth/}});
    //     if(customerRef.startsWith(identifier) && !terminal){
    //         return false;
    //     }
        
    //     return true;
    // },

    checkClearCustomerRefRequest(unpackedMessage){
        let etz_identifier = process.env.etz_identifier;
        let remita_collect_identifier = process.env.remita_collect_identifier;
        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef) return false;
        if(customerRef.startsWith(etz_identifier) || customerRef.startsWith(remita_collect_identifier) )
            return true;
        
        return false;
    },

    /**
     * 
     * @param {*} unpackedMessage unpacked iso message
     * @param {*} threshholdAmount threshholdamount set in env
     */
    checkEtzTransactionAboveThreshold(unpackedMessage, threshholdAmount) {
        let etz_identifier = process.env.etz_identifier;
        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef) return true;

        if(customerRef.startsWith(etz_identifier) && (Util.getTransactionAmount(unpackedMessage) > parseInt(threshholdAmount))) {

            return false;

        }

        return true;



    },



    // temporary for migration
    checkforMigratedTerminal(unpackedMessage){
        let handler = process.env.handler;

        let enabled = process.env.force_reprep;
        if(enabled != 'true') return false;

        if(handler == "POSVAS" && ["0200","0420"].includes(unpackedMessage.mti))
        {
            let terminalId = Util.getTerminalId(unpackedMessage);
            let terminal = migratedList.find(c=>c == terminalId);

            if(terminal) return Buffer.from("000120","hex");
        }

        return false;
    },

    /**
     * check if the request is IGR request
     * @param {Object} unpackedMessage unpacked message from pos
     */
    checkIGRRequest(unpackedMessage){

        let customerRef = Util.getCustomerRefData(unpackedMessage);
        if(!customerRef)
            return false;
        
        if(customerRef.startsWith(process.env.igr_identifier) || customerRef.startsWith(process.env.igr_zenith_identifier))
            return true;
        
        return false;    
    },

    checkRemitaRequest(unpackedMessage){
        return Util.isRemitaPOS(unpackedMessage);
    },

    checkWemaCollectRequest(unpackedMessage){
        return Util.isWemaCollectPOS(unpackedMessage);
    },

    blockNotifictionReversal(unpackedMessage){
        let toBlock = process.env.Block_Reversal || "";
        let toBlocks = toBlock.split(",") || [];
        
        if (["0420", "0430"].includes(unpackedMessage.mti)) {

            let customerRef = Util.getCustomerRefData(unpackedMessage)
            let identifier = Util.extractIdentifier(customerRef);
            if(toBlocks.includes(identifier)){
                return true;
            }
        }
        return false;
    }



}
