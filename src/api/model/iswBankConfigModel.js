/**
 * @author Adesola
 * @description Itex Integrated Property.
 */

const iswBankConfigSchema = require('../../schema/bankconfigsSchema');
const conn = require('../db/apiDbconnection');

let iswBankconfigModel = conn.model('bankConfig', iswBankConfigSchema);
 
iswBankconfigModel.getConfig = async function(terminalId,handler){
    let selector = terminalId.substr(0,4);
    return iswBankconfigModel.findOne({handler : handler,selectors : { $in: [selector] }});
}

module.exports = iswBankconfigModel;