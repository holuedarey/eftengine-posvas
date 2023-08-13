const mongoose = require('mongoose');
const interswitchSchema = require('../schema/interswitchConfigSchema');

let interswitchModel = mongoose.model('InterswitchConfig', interswitchSchema);

module.exports = interswitchModel;

interswitchModel.UpdatePinkey = function (config) {


    interswitchModel.findOne({})
        .then(datas => {
            let data = {};
            if (datas) {
                data = datas;
            }
            data.pinKey = config.pinKey;
            data.keyCheck = config.keyCheck;

            if (data._id) {
                data.updatedAt = new Date();
                interswitchModel.update({
                    _id: data._id
                }, data, function (err, data) {
                    if (err) {
                        console.error(`Error has occur updating interswitch config`);
                        console.error(err.toString());
                    } else {
                        console.log(`Interswitch config updated successfully`);
                    }
                });
            } else {
                interswitchModel.create(data, function (err, data) {
                    if (err) {
                        console.error(`Error has occur updating interswitch config`);
                        console.error(err.toString());
                    } else {
                        console.log(`Interswitch config updated successfully`);
                    }
                });
            }
        });

}


interswitchModel.getConfig = async function(){
    let configs = await interswitchModel.findOne({});

    if(!configs) return false;
    let config = configs;
    let sequenceNumber = config.sequence;
    sequenceNumber+=1;
    config.sequence = sequenceNumber;
    await config.updateOne({_id : config._id},config);
    return config;
}