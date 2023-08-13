const mongoose = require('mongoose');

let bankconfigsSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    handler : String,
    selectors : [String],
    tams : {
        IP_LIVE : {
            type: String,
            default: ''
        },
        PORT_LIVE : {
            type: String,
            default: ''
        },
        IP_TEST : {
            type: String,
            default: ''
        },
        PORT_TEST : {
            type: String,
            default: ''
        },
        COM_KEY_1 : {
            type: String,
            default: ''
        },
        COM_KEY_2 : {
            type: String,
            default: ''
        },
        BDK_NAME : {
            type : String,
            default: ''
        },
        TAMS_DIRECT : {
            type : Boolean,
            default : true
        }
    },
    useNibss_1 : {
        type : Boolean,
        default : true
    },
    useNibss_2 : {
        type : Boolean,
        default : true
    },
    useTams : {
        type : Boolean,
        default : false
    },
    useInterswitch :{
        type : Boolean,
        default : false
    },
    useUpsl : {
        type : Boolean,
        default : false
    },
    tamsPriority : {
        type  : Boolean,
        default : true
    },
    noAttemptNibss : {
        type : Boolean,
        default : false
    },
    useSelected : {type: Boolean, default : false},
    selected : {
        type : Array,default: []
    },
    responses : {type : Array, default : ["06","91"]}
}, { timestamps: true });

// bankconfigsSchema.index({ handler: 1, terminalId: 1 }, { index: true });

module.exports = bankconfigsSchema;
