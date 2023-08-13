/**
 * @author Alayesanmi Femi
 */
const express = require('express');
const router = express.Router();
const BankConfigControllers = require('../controllers/bankConfigs.controller');
const PermissionAuth = require('../middleswares/permissionAuth');

// Routes
/**
 * @description POST (add) a bank config
 */
router.post('/add_config',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    BankConfigControllers.addConfig);

/**
 * @description POST (add) a isw bank config
 */
router.post('/add-iswbank-config',
// PermissionAuth.verifyToken,
// PermissionAuth.isUser,
// PermissionAuth.isAdmin,
BankConfigControllers.addIswConfig);

/**
 * @description POST (add) a isw bank config
 */
 router.post('/update-iswbank-config',
 // PermissionAuth.verifyToken,
 // PermissionAuth.isUser,
 // PermissionAuth.isAdmin,
 BankConfigControllers.updateIswConfig);

/**
 * @description GET all bank configs
 */
router.get('/get_configs',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    BankConfigControllers.getConfigs);
/**
 * @description GET one bank config that matches request payload (id)
 */
router.get('/get_config/:id', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    BankConfigControllers.getSingleConfig);
/**
 * @description UPDATE one bank config that matches request payload (name)
 */
router.patch('/update_config/:id',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    BankConfigControllers.updateConfig);
/**
 * @description DELETE a bank config that matches request payload (id)
 */
router.delete('/delete_config/:id',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    BankConfigControllers.deleteConfig);
/**
 * @description GET a bank config that matches request payload (name)
 */
router.post('/search_config', BankConfigControllers.getConfigByNameorSelectors);

module.exports = router;