const TransactionServices = require("../services/transaction.services");

class TransactionControllers {
    
    /**
     * 
     * @param {*} request {amount, pinblock, icc, track2Data, 
     * terminalId, processingCode, stan, rrn, dataCode(F123), customRefData,
     * merchantCategoryCode, merchantId, merchantAddress }
     * @param {*} response 
     */
    async handleTransactionRequest(request, response) {

        try {

            const transactionParams = request.body;

            const transactionService = new TransactionServices(transactionParams);

            const transactionresponse = await transactionService.handle();

            return response.status(200).send(transactionresponse);

        } catch (error) {
            
            return response.status(500).send({ error: true, message: "An error has occured "});


        }

    }
}

module.exports = new TransactionControllers();