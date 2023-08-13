const mongoose = require('mongoose');
const bankSummarySchema = require('../schema/bankSummarySchema');
const Util = require('../helpers/Util');
const moment = require('moment');

const BankSummaryModel = mongoose.model('BankSummary',bankSummarySchema);

module.exports = BankSummaryModel;

BankSummaryModel.findToday = async(bank,resCode,cardType)=>{

    let startDate = moment().startOf('day').toDate();
    let endDate = moment().endOf('day').toDate();

    return await BankSummaryModel.findOne({
        bankCode : bank,
        statusCode : resCode,
        cardScheme : cardType,
        createdAt : {
            $gte: startDate,
            $lte: endDate
        }     
    });
}

BankSummaryModel.createNew = async (bank, cardType, transaction)=>{
    let bankName = Util.bankfromTID(transaction.terminalId);
    let ref = `${bank}${cardType}${transaction.responseCode}${moment().format('YYYY-MM-DD')}`
    return await BankSummaryModel.create({
        bankCode : bank,
        statusCode : transaction.responseCode,
        cardScheme : cardType,
        bankName : bankName,
        refCode : ref,
        transactionCount : 1,
        totalAmount : transaction.amount,
        messageReason : transaction.messageReason,
        handler : transaction.handlerUsed
    });
}

BankSummaryModel.updateToday = async (current,transaction)=>{
    current.transactionCount +=1;
    current.totalAmount += transaction.amount;

    return await BankSummaryModel.updateOne({
        _id: current._id
    }, {
        $set: {
            transactionCount: current.transactionCount,
            totalAmount: current.totalAmount
        }
    });
}
