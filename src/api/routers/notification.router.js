/**
 * @author Alayesanmi Femi
 */
const express = require('express');

const router = express.Router();

const NotificationControllers = require('../controllers/notification.controller');

const PermissionAuth = require('../middleswares/permissionAuth');

router.post('/addnotifier', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    NotificationControllers.registerNotifier);

router.get('/allnotifications',
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    NotificationControllers.getNotificatons);

router.get('/getNotification/:id', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    NotificationControllers.getNotification);

router.get('/getNotificationService/:id', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    NotificationControllers.getNotificationService);

router.patch('/updateNotifier/:id', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    NotificationControllers.updateNotifer);

router.delete('/deleteNotifier/:id', 
    PermissionAuth.verifyToken,
    PermissionAuth.isUser,
    PermissionAuth.isAdmin,
    NotificationControllers.deleteNotifier);



module.exports = router;
