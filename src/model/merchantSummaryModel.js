const mongoose = require('mongoose');

const merchantSummarySchema = require('../schema/merchantSummarySchema');

const Util = require('../helpers/Util');
const moment = require('moment');

const MerchantsSummaryModel = mongoose.model('MerchantSummary',merchantSummarySchema);

module.exports = MerchantsSummaryModel;

MerchantsSummaryModel.findToday = async(terminal,resCode,cardType)=>{

    let startDate = moment().startOf('day').toDate();
    let endDate = moment().endOf('day').toDate();

    return await MerchantsSummaryModel.findOne({
        terminalId : terminal,
        statusCode : resCode,
        cardScheme : cardType,
        createdAt : {
            $gte: startDate,
            $lte: endDate
        }     
    });
}

MerchantsSummaryModel.createNew = async (terminal, cardType, transaction)=>{

    let ref = `${terminal}${cardType}${transaction.responseCode}${moment().format('YYYY-MM-DD')}`;
    return await MerchantsSummaryModel.create({
        terminalId : terminal,
        merchantId : transaction.merchantId,
        statusCode : transaction.responseCode,
        cardScheme : cardType,
        merchantName : transaction.merchantName,
        refCode : ref,
        transactionCount : 1,
        totalAmount : transaction.amount,
        messageReason : transaction.messageReason,
        merchantAddr : transaction.merchantAddress,
        handler : transaction.handlerUsed
    });
}

MerchantsSummaryModel.updateToday = async (current,transaction)=>{
    current.transactionCount +=1;
    current.totalAmount += transaction.amount;

    return await MerchantsSummaryModel.updateOne({
        _id: current._id
    }, {
        $set: {
            transactionCount: current.transactionCount,
            totalAmount: current.totalAmount
        }
    });
}