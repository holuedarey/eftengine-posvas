/**
 * @author Adesola
 */

const mongoose = require('mongoose');

const iswKeySchema = new mongoose.Schema({
    iswKey: {
        type: String,
        require: true,
        index: true,
    },
    keyCheck : {
        type: String
    },
    handler: {
        type: String,
        index: true,
    }

},{ timestamps: true });

iswKeySchema.index({ handler: 1, merchants: 1, bin: 1 }, { index: true });

module.exports = iswKeySchema;