const mongoose = require('mongoose');
const terminalStateSchema = require('../schema/terminalStatesSchema');

module.exports = TerminalState = mongoose.model('TerminalState',terminalStateSchema);

