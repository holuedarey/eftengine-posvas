const NibssTransactionServices = require("../services/nibss.transaction.services");
const {generateAccessToken} = require('../helpers/utils');
const config = require('../config/config');

class TransactionControllers {
    
    /**
     * @param {*} request 
     * @param {*} response 
     * @param {*} next 
     */
    async routeTransactionToIsw(request, response, next){

    }

    /**
     * @param {*} request
     * @param {*} response
     * @param {*} next
     * @returns
     */
    async routeTransactionToNibss(request, response, next){
        try {
            const transactionParams = request.body;
            const transactionService = new NibssTransactionServices(transactionParams);
            const transactionresponse = await transactionService.handle();
            return response.status(200).json(transactionresponse);
        } catch (error) {
            console.log(error);
            return response.status(500).json({ error: true, message: "An error has occured "});
        }
    }

    /**
     * @param {*} request 
     * @param {*} response 
     * @param {*} next 
     * @returns 
     */
    async routeReversalTransactionToNibss(request, response, next){
        try {
            //Send RRN alone
            // const {rrn} = request.body;
            const transactionParams = request.body;
            const transactionService = new NibssTransactionServices(transactionParams);
            const transactionresponse = await transactionService.handleReversal();
            if(!transactionresponse) throw Error('Reversal Timedout');
            return response.status(200).json(transactionresponse);
        } catch (error) {
            console.error(error);
            return response.status(500).json({ error: true, message: "An error has occured "});
        }
    }

    /**
     * @param {*} request 
     * @param {*} response 
     * @param {*} next 
     * @returns 
     */
    async routeCallhomeToNibss(request, response, next){
        try {
            const transactionParams = request.body;
            const transactionService = new NibssTransactionServices(transactionParams);
            const transactionresponse = await transactionService.handle();
            return response.status(200).json(transactionresponse);
        } catch (error) {
            console.log(error);
            return response.status(500).json({ error: true, message: "An error has occured "});
        }
    }

    /**
     * @param {*} request 
     * @param {*} response 
     * @param {*} next 
     * @returns 
     */
    async routeTransactionToUp(request, response, next){
        try {
            const transactionParams = request.body;
            const transactionService = new NibssTransactionServices(transactionParams);
            const transactionresponse = await transactionService.handle();
            return response.status(200).json(transactionresponse);
        } catch (error) {
            console.log(error);
            return response.status(500).json({ error: true, message: "An error has occured "});
        }
    }

    async generateToken(request, response, next){
        try{
            const clientHash = generateAccessToken(config.CLIENT_SECRET_KEY, config.ALGORITHM, Buffer.from(config.INIT_VECTOR_KEY), Buffer.from(config.SECURE_VECTOR_KEY));
            return response.status(200).json({error: false, token: clientHash.toUpperCase()});
        }catch(error){
            console.log('error',error);
            return response.status(500).json({ error: true, message: "An error has occured "});
        }
    }
}

module.exports = new TransactionControllers();