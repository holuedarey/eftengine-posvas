const express = require('express');
const router = express.Router();
const JournalControllers = require('../controllers/journal.controllers');
const PermissionAuth = require('../middleswares/permissionAuth');

router.get('/alltransactions',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    JournalControllers.getAllTransactions);

router.get('/transacitonByrrn/:rrn', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    JournalControllers.getTransactionByRRN);

router.get('/transactionByTid/:terminalId',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    JournalControllers.getTransactionByTerminalID);

router.get('/transactionBydate',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,    
    JournalControllers.getTransactionByDate);

module.exports = router;