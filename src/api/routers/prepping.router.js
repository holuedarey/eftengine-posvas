const PreppingController = require('../controllers/prepping.controller');
const { validateRequest, preppingSchema, callhomeSchema } = require('../middleswares/prepping.validator');

const express = require('express');
const router = express.Router();

router.post('/itex-routing', validateRequest(preppingSchema), PreppingController.handleKeyExchange);
router.post('/itex-routing/callhome', validateRequest(callhomeSchema), PreppingController.handleCallhome);
router.post('/itex-routing/up', validateRequest(preppingSchema), PreppingController.handleUpKeyExchange);

module.exports = router;