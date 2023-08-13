const Joi = require('joi');
const ApiResponse = require('../helpers/Response');
const apiStatusCodes = require('../helpers/statusCodes');
const cryptojs = require('crypto-js');


const validateRequest = (schema) => { 
    return (req, res, next) => { 
        const { error } = Joi.validate(req.body, schema); 
        const valid = error == null; 

        if (valid) { 
            next(); 
        } else { 
            const { details } = error; 
            
            const errors = details.map(i => i.message);

            return ApiResponse.send(res, apiStatusCodes.badRequest, null, errors);
        
        } 
    }
}

const validateHeaders = (request, res, next) => {
    if(!request.headers.authorization || !request.headers.terminalid) {
        return res.status(400).json({error: true, message: ["Invalid headers supplied, authorization and terminalid are required"] });
    }

    const hashData = cryptojs.SHA256(request.headers.terminalid).toString();

    const errors = [];
    if(request.headers.authorization !== Buffer.from(hashData, 'utf-8').toString('base64')) {
        errors.push("Invalid authorization header");
    }

    if(request.headers.terminalid !== request.body.terminalId) {
        errors.push("Invalid terminalid supplied in header");
    }

    if(errors.length > 0) {
        return res.status(400).json({error: true, message: errors });
    }
    next();
}

const transactionSchema = Joi.object({
    pinblock: Joi.string().optional(),
    icc: Joi.string().required(),
    track2Data: Joi.string().required(),
    terminalId: Joi.string().required(),
    processingCode: Joi.string().required(),
    stan: Joi.string().required(),
    rrn: Joi.string().required(),
    dataCode: Joi.string().required(),
    customRefData: Joi.string().required(),
    merchantCategoryCode: Joi.string().required(),
    merchantId: Joi.string().required(),
    amount: Joi.string().required(),
    sequenceNumber: Joi.string().required(),
    merchantAddress: Joi.string().required(),
  });

//Previously met before the ABOVE added
// const transactionSchema = Joi.object({
//     pinblock: Joi.string().optional(),
//     icc: Joi.string().required(),
//     track2Data: Joi.string().required(),
//     terminalId: Joi.string().required(),
//     processingCode: Joi.string().required(),
//     stan: Joi.string().required(),
//     rrn: Joi.string().required(),
//     dataCode: Joi.string().required(),
//     customRefData: Joi.string().required(),
//     merchantCategoryCode: Joi.string().required(),
//     merchantId: Joi.string().required(),
//     merchantAddress: Joi.string().required(),
// })

const jaizTransactionSchema = Joi.object({
    track2data: Joi.string().max(37).required(),
    processingCode: Joi.string().max(6).required(),
    amount: Joi.string().min(12).max(12).required(),
    merchantCategoryCode: Joi.string().min(4).max(4).required(),
    sequenceNumber: Joi.string().min(3).max(3).required(),
    rrn: Joi.string().min(12).max(12).optional(),
    stan: Joi.string().min(6).max(6).optional(),
    terminalId: Joi.string().min(8).max(8).required(),
    merchantId: Joi.string().max(15).required(),
    merchantAddress: Joi.string().max(40).required(),
    pinblock: Joi.string().max(16).optional(),
    icc: Joi.string().max(510).required(),
    customRefData: Joi.string().max(255).required(),
    dataCode: Joi.string().max(15).required(),
    transactionTime: Joi.string().min(6).max(6).optional(),
    transactionDate: Joi.string().min(4).max(4).optional(),
    txnDateAndTime: Joi.string().min(10).max(10).optional(),
    fiic: Joi.string().max(11).optional(),
    aiic: Joi.string().max(11).optional(),
    transactionType: Joi.string().max(2).required(),
});

const jaizReversalSchema = Joi.object({
    pan: Joi.string().max(19).required(),
    rrn: Joi.string().min(12).max(12).required(),
    terminalId: Joi.string().min(8).max(8).required(),
    track2data: Joi.string().max(37).optional(),
    sequenceNumber: Joi.string().min(3).max(3).optional(),
    pinblock: Joi.string().max(16).optional(),
    icc: Joi.string().max(510).optional(),
    dataCode: Joi.string().max(15).optional(),
    reversal: Joi.boolean().required(),
});

module.exports = { validateRequest, validateHeaders, transactionSchema, jaizTransactionSchema, jaizReversalSchema }
