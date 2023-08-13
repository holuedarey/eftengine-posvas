/**
 * @author Adeyemi Adesola
 */
const mongoose = require('mongoose');
const directcardConfigSchema = require('../schema/directcardConfigSchema');
let directcardConfigModel = mongoose.model('directcardconfig', directcardConfigSchema)
 
directcardConfigModel.getConfig = async function(handler, unpackedMsg){
    if(!unpackedMsg || !handler) return false;
    if(unpackedMsg.mti.slice(0,2) === '08' || unpackedMsg.mti.slice(0,2) === '01' || unpackedMsg.dataElements[3].substring(0, 2) === "01") return false;
    let bankSelector = unpackedMsg.dataElements[41].substr(0,4);
    if(!["2044", "2063"].includes(bankSelector)) return false;
    let binSelector = unpackedMsg.dataElements[2].slice(0,6);
    let merchantSelector = unpackedMsg.dataElements[42];
    // To use all you dont need to search by merchant - check that useSelected is false.
    return directcardConfigModel.findOne({ handler: handler, bankSelector: {$in: [bankSelector]}, bin: { $in: [binSelector] }, merchants: { $in: [merchantSelector] } });
    //For Production
    // return directcardConfigModel.findOne({ handler: handler, bankSelector: {$in: [bankSelector]}, bin: { $in: [binSelector] } });
}

module.exports = directcardConfigModel;