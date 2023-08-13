/** 
 * @author Abolaji
 */

const mongoose = require('mongoose');


module.exports = new mongoose.Schema({
    ref : String,
    lat : Number,
    lon : Number,
    geo_addr : String,
    ptad: String,
    serial: String,
    ctime: Date,
    bl: Number,
    cs: String,
    ps: String,
    tid: String,
    mid: String,
    merchantData: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Merchants'
    },
    coms: String,
    ss: Number,
    cloc: Object,
    sim: String,
    tmn: String,
    tmanu: String,
    hb: String,
    sv: String,
    build: String,
    lTxnAt: Date,
    pads: String,
}, {
    timestamps: true
});