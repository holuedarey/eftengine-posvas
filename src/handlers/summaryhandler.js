/**
 * @author Abolaji
 */
const BankSummary = require('../model/bankSummaryModel');
const MerchantSummary = require('../model/merchantSummaryModel');
const Util = require('../helpers/Util');

class SummaryHandler {

    /**
     * update bank based statistics
     * @param {*} transactionDetails transaction journal
     */
    static async updateBankStatistics(transactionDetails) {

        try {
            // let selector = transactionDetails.terminalId.substr(0, 4);
            let bankCode = Util.bankfromTID(transactionDetails.terminalId,true);

            let cardType = Util.getCardType(transactionDetails.maskedPan);
            let today = await BankSummary.findToday(bankCode, transactionDetails.responseCode, cardType);

            if (today != null) {
                await BankSummary.updateToday(today, transactionDetails);

                console.log(`bank summary updated rrn : ${transactionDetails.rrn}, terminal : ${transactionDetails.terminalId} at ${(new Date()).toString()}`);

            } else {
                await BankSummary.createNew(bankCode, cardType, transactionDetails);

                console.log(`bank summary created rrn : ${transactionDetails.rrn}, terminal : ${transactionDetails.terminalId} at ${(new Date()).toString()}`);

            }

        } catch (error) {
            console.error(`bank summary update failed, rrn : ${transactionDetails.rrn}, terminal : ${transactionDetails.terminalId} at ${(new Date()).toString()}, error ${error.toString()}`);
        }

    }

    /**
     * update merchant based statistics
     * @param {*} transactionDetails transaction journal
     */
    static async updateMerchantStatistics(transactionDetails) {
        try {
            let selector = transactionDetails.terminalId;
            let cardType = Util.getCardType(transactionDetails.maskedPan)
            let today = await MerchantSummary.findToday(selector, transactionDetails.responseCode, cardType);

            if (today != null) {
                await MerchantSummary.updateToday(today, transactionDetails);

                console.log(`merchant summary updated rrn : ${transactionDetails.rrn}, terminal : ${transactionDetails.terminalId} at ${(new Date()).toString()}`);

            } else {

                await MerchantSummary.createNew(selector, cardType, transactionDetails);

                console.log(`merchant summary created rrn : ${transactionDetails.rrn}, terminal : ${transactionDetails.terminalId} at ${(new Date()).toString()}`);

            }

        } catch (error) {
            console.error(`merchant summary update failed, rrn : ${transactionDetails.rrn}, terminal : ${transactionDetails.terminalId} at ${(new Date()).toString()}, error ${error.toString()}`);
        }
    }
}


module.exports = SummaryHandler;