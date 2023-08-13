/**
 * @author Abolaji
 */
const mongoose = require('mongoose');
const bankconfigSchema = require('../schema/bankconfigsSchema');
const Moment = require('moment');

let bankconfigModel = mongoose.model('Bankconfig', bankconfigSchema)

bankconfigModel.getConfig = async function(terminalId,handler){
    let selector = terminalId.substr(0,4);
    return await bankconfigModel.findOne({handler : handler,selectors : { $in: [selector] }});
}

module.exports = bankconfigModel;

