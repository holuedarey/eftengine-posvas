const mongoose = require('mongoose');
const terminalKeyScheme = require('../schema/terminalkeysSchema');

module.exports = TerminalKey = mongoose.model('TerminalKey', terminalKeyScheme);

/**
 * get terminalkey object by terminal Id
 * @param {String} terminalId terminal Id to look for
 * @returns {Object} terminalKey object if found
 */
TerminalKey.findTerminal = async function (terminalId) {
    return TerminalKey.findOne({
        terminalId: terminalId
    });
}

TerminalKey.getSequenceNumber = async function(terminalId){
    terminal = await TerminalKey.findTerminal(terminalId);
    let sequenceNumber = terminal.sequenceNumber || 0;
    sequenceNumber+=1;
    terminal.sequenceNumber = sequenceNumber;
    await TerminalKey.updateOne({terminalId : terminalId},terminal);
    return sequenceNumber;
}


TerminalKey.createOrUpdate = function (terminalId, update, done) {
    let query = {
        terminalId: terminalId
    };
    options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
    };

    // Find the document
    Model.findOneAndUpdate(query, update, options, function (error, result) {
        done(error, result);
    });
}