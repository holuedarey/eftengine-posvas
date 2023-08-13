const mongoose = require("mongoose");
const Util = require("../helpers/Util");
const moment = require("moment-timezone");

const restrictedJournalSchema = require("../schema/restrictedJournalSchema");

let restrictedJournalModel = mongoose.model("restrictedJournals", restrictedJournalSchema);

module.exports = restrictedJournalModel;

restrictedJournalModel.findPreviousRRN = async function (unpackedMessage) {
  try {
    return await restrictedJournalModel.findOne({
      prrn: unpackedMessage.dataElements[37],
      terminalId: unpackedMessage.dataElements[41],
      transactionTime: {
        $gte: moment().startOf("day").toDate(),
        $lte: moment().endOf("day").toDate(),
      },
      maskedPan:
        unpackedMessage.dataElements[2].substr(0, 6) +
        "".padEnd(unpackedMessage.dataElements[2].length - 10, "X") +
        unpackedMessage.dataElements[2].slice(-4),
    });
  } catch (error) {
    console.log(error);
    return false;
  }
};

restrictedJournalModel.SaveReversalRequest = function (
  unpackedMessage,
  handlerName,
  done
) {
  let saveDetails = {
    rrn: unpackedMessage.dataElements[37],
    onlinePin: unpackedMessage.dataElements[52] !== null ? true : false,
    merchantName: unpackedMessage.dataElements[43].substring(0, 22),
    merchantAddress: unpackedMessage.dataElements[43].substring(23),
    merchantId: unpackedMessage.dataElements[42],
    terminalId: unpackedMessage.dataElements[41],
    STAN: unpackedMessage.dataElements[11],
    transactionTime: new Date(),
    merchantCategoryCode: unpackedMessage.dataElements[18],
    handlerName: handlerName,
    MTI: unpackedMessage.mti,
    maskedPan:
      unpackedMessage.dataElements[2].substr(0, 6) +
      "".padEnd(unpackedMessage.dataElements[2].length - 10, "X") +
      unpackedMessage.dataElements[2].slice(-4),
    processingCode: unpackedMessage.dataElements[3],
    amount: parseInt(unpackedMessage.dataElements[4]),
    currencyCode: unpackedMessage.dataElements[49],
    messageReason: unpackedMessage.dataElements[56],
    originalDataElements: unpackedMessage.dataElements[90],
  };
  restrictedJournalModel.create(saveDetails, function (err, data) {
    if (err) done(err, null);
    else done(false, data);
  });
};

restrictedJournalModel.updateReversalResponse = function (transaction, done) {
  restrictedJournalModel.updateOne(
    {
      _id: transaction._id,
    },
    transaction,
    function (err, data) {
      if (err) done(err, null);
      else done(false, data);
    }
  );
};


restrictedJournalModel.updateWriteError = function (transaction) {
  restrictedJournalModel.updateOne(
    {
      rrn: transaction.rrn,
      terminalId: transaction.terminalId,
      STAN: transaction.STAN,
    },
    { $set: { write2pos: "06" } },
    (err, data) => {
      if (err) {
        console.error(
          `Error updating writ2pos data, terminalId: ${
            transaction.terminalId
          }, rrn: ${transaction.rrn} at ${new Date().toString()}`
        );
      } else {
        console.log(
          `writ2pos data updated, terminalId: ${transaction.terminalId}, rrn: ${
            transaction.rrn
          } at ${new Date().toString()}`
        );
      }
    }
  );
};
