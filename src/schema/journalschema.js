const mongoose = require("mongoose");

let journalSchema = new mongoose.Schema({
    amount: {type: Number, index: true},
    authCode: String,
    currencyCode: String,
    cardExpiry: {type: String, index: true},
    //Not used
    cardName: {type: String, index: true},
    CRIM : String,
    customData: { type: Object, default: null },
    customerRef : String,
    customTransactionId: String,
    ejournalData: { type: Object, default: null },
    failOverRrn : {type: String, index: true},
    FIIC : {type: String},
    //Not in Use
    handler: {type: String, index: true},
    handlerName: {type: String, index: true},
    handlerResponseTime: {type: Date, index: true},
    handlerUsed : {type: String, index: true},
    isContactless: {type: Boolean, index: true },
    isNotified: Boolean,
    interSwitchResponse : {type: String, index: true},
    isVasComplete: Boolean,
    maskedPan: {type: String, index: true},
    //Not used
    merchant : Object,
    merchantAddress: {type: String, index: true},
    merchantCategoryCode: {type: String, index: true},
    merchantId: {type: String, index: true},
    merchantName: {type: String, index: true},
    messageReason:  {type: String, index: true},
    MTI: {type: String, index: true},
    notified : String,
    oldResCode : {type: String, index: true},
    onlinePin: {type: Boolean, index: true},
    originalDataElements:  String,
    pfmNotified : String,
    posEntryMode: {type: String, default: ""},
    posDataCode: {type: String, default: ""},
    processingCode: {type: String, index: true},
    prrn: {type: String, default: null, index: true},
    //Not in use
    processTime: {type: Number, index: true},
    receipt : {type : String, default : "paper"},
    receiptSent : {type: Boolean, default : false},
    responseCode: {type: String, index: true},
    rrn: {type: String, index: true},
    script : String,
    STAN: {type: String, index: true},
    terminalId: {type: String, index: true},
    transactionTime: {type: Date, index: true},
    transactionType: { default: "Purchase", type: String, index: true },
    TVR : String,
    vasData : {type: Object, default : null},
    upslResponse : {type: String, index: true},
    upslTerminalIdUsed: {type: String, index: true},
    write2pos : {
        type : String,
        index: true
    },
    // for tams response
    tamsBatchNo: {type: String, index: true},
    tamsMessage : String,
    tamsRRN : {type: String, index: true},
    tamsStatus : {type: String, index: true},
    tamsTransNo  : {type: String, index: true},
},{
    timestamps: true,
});

journalSchema.index({ rrn: 1, terminalId: 1 }, { index: true });
journalSchema.index({ rrn: 1, terminalId: 1, handlerUsed: 1 }, { index: true });
journalSchema.index({ merchantId: 1, maskedPan: 1, transactionType: 1}, { index: true });
// journalSchema.index({ vasData[wallet]: 1 }, { index: true });

//   journalSchema.index({
//     merchantId: 1, maskedPan: 1, transactionType: 1
//   }, { unique: true });
journalSchema.index({ MTI: 1, rrn: 1, terminalId: 1, transactionTime: 1, maskedPan: 1 }, { index: true });
journalSchema.index({ rrn: 1, terminalId: 1, STAN: 1 }, { index: true });

module.exports = journalSchema;