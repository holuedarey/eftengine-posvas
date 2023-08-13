const PreppingServices = require("../services/prepping.services");
const UpPreppingServices = require("../services/upsl.prepping.service");

class PreppingControllers {
    
    /**
     * 
     * @param {*} request {amount, pinblock, icc, track2Data, 
     * terminalId, processingCode, stan, rrn, dataCode(F123), customRefData,
     * merchantCategoryCode, merchantId, merchantAddress }
     * @param {*} response 
     */
    async handlePrepRequest(request, response) {

        try {

            const transactionParams = request.body;

            const preppingService = new PreppingServices(preppingParams);

            const preppingResponse = await preppingService.handle();

            return response.status(200).send(preppingResponse);

        } catch (error) {
            
            return response.status(500).send({ error: true, message: "An error has occured "});


        }

    }

    async handleKeyExchange(request, response, next) {

        try {
            const masterkeyParams = request.body;
            // console.log('getting to key exchange controller now')

            const preppingService = new PreppingServices(masterkeyParams);

            const preppingResponse = await preppingService.handleKeyExchange();
            console.log('response at controller', preppingResponse);

            return response.status(200).json({error: false, data: preppingResponse});
        } catch (error) {
            console.error(error.message);
            return response.status(500).json({ error: true, message: "An error has occured "});
        }

    }

    async handleCallhome(request, response, next) {

        try {
            const callHomeParams = request.body;
            console.log('getting to callhome controller now')

            const preppingService = new PreppingServices(callHomeParams);
            const preppingResponse = await preppingService.handleCallHome();
            console.log('response at controller', preppingResponse);
            return response.status(200).json({error: false, data: preppingResponse});
        } catch (error) {
            return response.status(500).json({ error: true, message: "An error has occured "});
        }

    }

    async handleUpKeyExchange(req, res, next){
        try{
            const masterkeyParams = request.body;
            // console.log('getting to key exchange controller now')

            const upsl_preppingService = new UpPreppingServices(masterkeyParams);

            const preppingResponse = await upsl_preppingService.handleKeyExchange();
            console.log('response at controller', preppingResponse);

            return response.status(200).json({error: false, data: preppingResponse});
        }catch(e){

        }
    }

}

module.exports = new PreppingControllers();