const mongoose = require('mongoose');
const iswterminalKeySchema = require('../schema/iswTerminalKeySchema');

module.exports = iswTerminalKey = mongoose.model('iswTerminalKey', iswterminalKeySchema);

/**
 * get iswTerminalkey object by handler
 * @param {String} handler handler to look for
 * @returns {Object} iswKey object if found
 */
iswTerminalKey.findKey = async function (handler) {
    return iswTerminalKey.findOne({
        handler: handler
    });
}

iswTerminalKey.createOrUpdate = function (handler, newupdate) {
    let filter = {
        handler: handler
    };
    let options = {
        new: true,
        upsert: true,
        rawResult: true,
    };
    update = {
        iswKey: newupdate.iswPinKey,
        keyCheck: newupdate.keyCheck,
    }

    // Find the document and update or create new one.
    return iswTerminalKey.findOneAndUpdate(filter, update, options);
}