const Joi = require('joi');
const ApiResponse = require('../helpers/Response');
const apiStatusCodes = require('../helpers/statusCodes');

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

const preppingSchema = Joi.object({
    terminalId: Joi.string().required(),
    serialNo: Joi.string().required().min(8),
    processingCode: Joi.string().optional(),
    stan: Joi.string().optional(),
});

const callhomeSchema = Joi.object({
    terminalId: Joi.string().required(),
    serialNo: Joi.string().required().min(8),
    callhomeData: Joi.object({
    ptad: Joi.string().required(),
    bl: Joi.number().required(),
    cs: Joi.string().required(),
    ps: Joi.string().required(),
    mid: Joi.string().required(),
    coms: Joi.string().required(),
    ss: Joi.string().optional().allow(''),
    cloc: Joi.object({
        cid: Joi.string().optional().allow(''),
        lac: Joi.string().optional().allow(''),
        mcc: Joi.string().optional().allow(''),
        mnc: Joi.string().optional().allow('')
    }),
    sim: Joi.string().optional().allow(''),
    tmn: Joi.string().required(),
    tmanu: Joi.string().required(),
    hb: Joi.string().required(),
    sv: Joi.string().required(),
    build: Joi.string().required(),
    lTxnAt: Joi.string().optional().allow(''),
    pads: Joi.string().required().allow('')
    }),
    commServiceProvider: Joi.string().required(),
    appVersion: Joi.string().required(),
    paymentMode: Joi.string().required(),
});

module.exports = { validateRequest, preppingSchema, callhomeSchema }
