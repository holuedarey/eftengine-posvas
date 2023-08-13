const TransactionController = require('../controllers/transaction.controller');
const UpslTransactionController = require('../controllers/upsl.transaction.controllers');
const { validateRequest, validateHeaders, transactionSchema, jaizTransactionSchema, jaizReversalSchema } = require('../middleswares/transaction.validator');
const PermissionAuth = require('../middleswares/permissionAuth');

const express = require('express');

const router = express.Router();

router.post('/up', 
// validateRequest(transactionSchema), TransactionController.handleTransactionRequest
validateHeaders, UpslTransactionController.handleTransactionRequest);

router.post('/itex-routing', PermissionAuth.verifyClient, validateRequest(jaizTransactionSchema), TransactionController.routeTransactionToNibss);
router.post('/itex-routing/reversal', PermissionAuth.verifyClient, validateRequest(jaizReversalSchema), TransactionController.routeReversalTransactionToNibss);

router.post('/itex-routing/isw', validateRequest(jaizTransactionSchema), TransactionController.routeTransactionToIsw);
router.post('/itex-routing/up', validateRequest(jaizTransactionSchema), TransactionController.routeTransactionToUp);

// router.get('/getToken', TransactionController.generateToken);
module.exports = router;
