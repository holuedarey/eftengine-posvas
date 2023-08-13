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
class NotificationProcessors {
    /**
     * 
     * @param {*} data (request payloads) 
     * @memberof NotificationProcessors
     * @returns true || false + validation errors
     */
    static isConfigPayloadValid(data) {

        let errors = [];

        if((!data.regNotifier.merchantId && !data.regNotifier.terminalId) 
            || (data.regNotifier.merchantId === null && data.regNotifier.terminalId === null ) 
            || (data.regNotifier.merchantId === '' && data.regNotifier.terminalId === '')) {
            errors.push('Merchant Id or Terminal Id is required');
        }

        if(!data.regNotifier.name || data.regNotifier.name === null){
            errors.push('Merchant Name is required')
        }

        if(data.regNotifier.enabled === null) {
            errors.push('Enabled field is required')
        }

        if(!data.notificationservice.url || data.notificationservice.url === null) {
            errors.push('Notification Service URL is required ')
        }

        if(!data.notificationservice.notificationClass || data.notificationservice.notificationClass === null) {
            errors.push('Notification Class is required')
        }

        if(!data.notificationservice.key || data.notificationservice.key === null) {
            errors.push('key is required')
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

module.exports = NotificationProcessors;