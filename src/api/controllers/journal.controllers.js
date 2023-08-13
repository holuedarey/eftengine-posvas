const moment = require('moment');
const journalModel = require('../../model/journalmodel');
const Response = require('../helpers/Response');
const responseStatusCodes = require('../helpers/statusCodes');


 class JournalController {

    static async getAllTransactions(req, res){

        let transactions = await journalModel.find();

        return Response.success(res, responseStatusCodes.success, transactions, 'all transactions');
    }

    static async getTransactionByRRN(req, res){
        let rrn = req.params.rrn;

        await journalModel.findOne({ rrn }, (err, transactions) => {
            if (err) return res.status(responseStatusCodes.serverError).send(err);
            return Response.success(res, responseStatusCodes.success, transactions, `all transactions for this rrn: ${req.params.rrn}`)
        });
    }

    static async getTransactionByTerminalID(req, res) {
        let terminalId = req.params.terminalId;

        await journalModel.findOne({ terminalId }, (err, transactions) => {
            if (err) return res.status(responseStatusCodes.serverError).send(err);
            return Response.success(res, responseStatusCodes.success, transactions, `all transactions for this terminalId: ${req.params.terminalId}`)
        });
    }

    static async getTransactionByDate(req, res) {
        let start = moment(req.query.start), end = moment(req.query.end);

        
        await journalModel.find({
            'transactionTime' : {
                '$gte': start.toISOString(),
                '$lt': end.toISOString()
            }
        }, (err, transactions) => {
            if(err) return res.status(responseStatusCodes.serverError).send(err)
            return Response.success(res, responseStatusCodes.success, transactions, 
                `all transactions from ${start} to ${end}`)
        })
    }
    
 }

 module.exports = JournalController;