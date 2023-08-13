const AuthController = require('../controllers/auth.controllers');
const PermissionAuth = require('../middleswares/permissionAuth');


const express = require('express');

const router = express.Router();

router.post('/register',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    AuthController.addUser);

router.post('/login', AuthController.loginUser);

module.exports = router;
