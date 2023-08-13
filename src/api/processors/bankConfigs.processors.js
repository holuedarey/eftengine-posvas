/**
 * @author Alayesanmi Femi
 */
const validateIP = require("../helpers/validateIP");
const BankConfig = require('../../model/bankconfigModel');
const validator = require("validator");

/**
 * @class BankConfigProcessors
 * @description handles pre-processing of api payload 
 */
class BankConfigProcessors {
    /**
     * 
     * @param {*} data (request payloads) 
     * @memberof BankConfigProcessors
     * @returns true || false + validation errors
     */
    static isConfigPayloadValid(data) {
       
        let bankConfig = data;
        
        let errors = [];

        if(bankConfig.useTams === true && validateIP(bankConfig.tams.IP_LIVE) === false) {
            bankConfig.tams.IP_LIVE = null
        }

        if(bankConfig.useTams === true && validateIP(bankConfig.tams.IP_TEST) === false) {
            bankConfig.tams.IP_TEST = null
        }

        
        if(!bankConfig.name || bankConfig.name === null || bankConfig.name === ''){
            errors.push('Bank name is required')
        }
        if(!bankConfig.selectors || bankConfig.selectors === null || bankConfig.selectors === ''){
            errors.push('Bank Selectors are required');
        }
        if(!bankConfig.useNibss_2 && !bankConfig.useNibss_1){
            errors.push('Specify to use Either NIBSS 1 or NIBSS 2 or both ')
        }
        if(bankConfig.useTams && !bankConfig.tams.IP_LIVE){
            errors.push('Enter TAMS Config (Live IP) to use TAMS host')            
        }

        if(bankConfig.useTams && !bankConfig.tams.IP_TEST){
            errors.push('Enter TAMS Config (Test IP) to use TAMS host')            
        }

        if(bankConfig.useTams && !bankConfig.tams.PORT_LIVE){
            errors.push('Enter TAMS Config (Live Port) to use TAMS host')            
        }

        if(bankConfig.useTams && !bankConfig.tams.PORT_TEST){
            errors.push('Enter TAMS Config (Test Port) to use TAMS host')            
        }

        if(bankConfig.useTams && !bankConfig.tams.COM_KEY_1){
            errors.push('Enter TAMS Config (Component key 1) to use TAMS host')            
        }

        if(bankConfig.useTams && !bankConfig.tams.COM_KEY_2){
            errors.push('Enter TAMS Config (Component Key 2) to use TAMS host')            
        }

        if(bankConfig.useTams && !bankConfig.tams.BDK_NAME){
            errors.push('Enter TAMS Config (BDK NAME) to use TAMS host')            
        }

        if((bankConfig.useTams && bankConfig.tams.IP_LIVE == '') ||
         (bankConfig.useTams && bankConfig.tams.IP_LIVE == null
             && validateIP(bankConfig.tams.IP_LIVE) === false 
             && validator.isIP())){
            errors.push('Enter TAMS Config (IP Live) to use TAMS host')          
        }

        if((bankConfig.useTams && bankConfig.tams.IP_TEST == '') ||
         (bankConfig.useTams && bankConfig.tams.IP_TEST == null && validateIP(bankConfig.tams.IP_TEST) === false)){
            errors.push('Enter TAMS Config (IP Test) to use TAMS host')            
        }

        if((bankConfig.useTams && bankConfig.tams.PORT_LIVE == '') ||
         (bankConfig.useTams && bankConfig.tams.PORT_LIVE == null)){
            errors.push('Enter TAMS Config (Live Port) to use TAMS host')            
        }


        if((bankConfig.useTams && bankConfig.tams.PORT_TEST == '') ||
         (bankConfig.useTams && bankConfig.tams.PORT_TEST == null)){
            errors.push('Enter TAMS Config (Test Port) to use TAMS host')       
        }

        if((bankConfig.useTams && bankConfig.tams.COM_KEY_1 == '') ||
        (bankConfig.useTams && bankConfig.tams.COM_KEY_1 == null)){
            errors.push('Enter TAMS Config (Component Key 1) to use TAMS host')           
       }

       if((bankConfig.useTams && bankConfig.tams.COM_KEY_2 == '') ||
       (bankConfig.useTams && bankConfig.tams.COM_KEY_2 == null)){
           errors.push('Enter TAMS Config (Component Key 2) to use TAMS host')           
       }

       if((bankConfig.useTams && bankConfig.tams.BDK_NAME == '') ||
       (bankConfig.useTams && bankConfig.tams.BDK_NAME == null)){
           errors.push('Enter TAMS Config (Component Key 2) to use TAMS host')           
       }

        if(errors.length > 0){
            return {
                isValid: false,
                errors
            };
        }
        return { isValid: true };

    }

    /**
     * 
     * @param {*} data (request payloads) 
     * @memberof APIProcessor
     * @returns true || false + validation errors
     */

    static isConfigUpdatePayload(data){
        let bankConfig = data;
        
        let errors = [];

        if(bankConfig.useTams === true && validateIP(bankConfig.tams.IP_LIVE) === false) {
            bankConfig.tams.IP_LIVE = null
        }

        if(bankConfig.useTams === true && validateIP(bankConfig.tams.IP_TEST) === false) {
            bankConfig.tams.IP_TEST = null
        }


        if((bankConfig.useTams && bankConfig.tams.IP_LIVE == '') ||
         (bankConfig.useTams && bankConfig.tams.IP_LIVE == null )){
            errors.push('Enter TAMS Config (IP Live) to use TAMS host')          
        }

        if((bankConfig.useTams && bankConfig.tams.IP_TEST == '') ||
         (bankConfig.useTams && bankConfig.tams.IP_TEST == null)){
            errors.push('Enter TAMS Config (IP Test) to use TAMS host')            
        }

        if((bankConfig.useTams && bankConfig.tams.PORT_LIVE == '') ||
         (bankConfig.useTams && bankConfig.tams.PORT_LIVE == null)){
            errors.push('Enter TAMS Config (Live Port) to use TAMS host')            
        }


        if((bankConfig.useTams && bankConfig.tams.PORT_TEST == '') ||
         (bankConfig.useTams && bankConfig.tams.PORT_TEST == null)){
            errors.push('Enter TAMS Config (Test Port) to use TAMS host')       
        }

        if((bankConfig.useTams && bankConfig.tams.COM_KEY_1 == '') ||
        (bankConfig.useTams && bankConfig.tams.COM_KEY_1 == null)){
            errors.push('Enter TAMS Config (Component Key 1) to use TAMS host')           
       }

       if((bankConfig.useTams && bankConfig.tams.COM_KEY_2 == '') ||
       (bankConfig.useTams && bankConfig.tams.COM_KEY_2 == null)){
           errors.push('Enter TAMS Config (Component Key 2) to use TAMS host')           
       }

       if((bankConfig.useTams && bankConfig.tams.BDK_NAME == '') ||
       (bankConfig.useTams && bankConfig.tams.BDK_NAME == null)){
           errors.push('Enter TAMS Config (BDK Name) to use TAMS host')           
       }

        if(errors.length > 0){
            return {
                isValid: false,
                errors
            };
        }
        return { isValid: true };

     }

}

module.exports = BankConfigProcessors;