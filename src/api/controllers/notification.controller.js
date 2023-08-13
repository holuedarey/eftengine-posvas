/**
 * @author Alayesanmi Femi
 */
const NotificationModel = require('../../model/notificationservicemodel');
const RegNotificationModel = require('../../model/registerednotificationmodel');
const NotificationProcessor = require('../processors/notification.processors');

const StatusCodes = require('../helpers/statusCodes');

/**
 * @class NotificationController
 * @description controller for all bank notification routes
 * 
 */
class NotificationController {

    static async registerNotifier(req, res) {
        let data = {};

        data.regNotifier = {
            name: req.body.name,
            enabled: req.body.enabled,
            merchantId: req.body.merchantId,
            terminalId: req.body.terminalId
        },
        data.notificationservice = {
            name: req.body.name,
            url: req.body.url,
            key: req.body.key,
            notificationClass: req.body.notificationClass,
            enabled: req.body.enabled
        }

        if(!NotificationProcessor.isConfigPayloadValid(data).isValid){
            return res.status(StatusCodes.badRequest).json({
              status: StatusCodes.badRequest, 
              error: NotificationProcessor.isConfigPayloadValid(data).errors,
            });
        }

        let notificationService = new NotificationModel(data.notificationservice);

        await NotificationModel.findOne({
                name: data.regNotifier.name
        })
        .then(doc => {
            if(doc) {
                return res.status(StatusCodes.conflict).json({
                    status: StatusCodes.conflict,
                    error: 'Notification already exists',
                   });
            } else {
                notificationService.save((err, doc) => {
                  
                    data.regNotifier.notificationService = doc.id;
                    let regNotifer = new RegNotificationModel(data.regNotifier);
                    
                    regNotifer.save()

                    if(err) return res.status(StatusCodes.serverError).send(err);
                     return res.status(StatusCodes.created).json({
                       status: StatusCodes.created, 
                       data: doc,
                    });
                });
            }
        })
    }

    static async getNotificatons(req, res) {

        await RegNotificationModel.find().sort({_id:'asc'}).exec((err,doc)=>{
            if(err) return res.status(400).send(err);
    
            if(doc === null || doc.length === 0){
             return res.status(StatusCodes.notFound).json({
                status: StatusCodes.notFound, 
                data: doc
              })          
            }
            return res.status(StatusCodes.success).json({
              status: StatusCodes.success, 
              data: doc
            });
        })

    }

    static async getNotificationService(req, res) {

        let id = req.params.id;

        await NotificationModel.findById(id,(err,doc)=>{
            if(err) return res.status(400).send(err);
            if(doc === null){
             return res.status(StatusCodes.notFound).json({
                status: StatusCodes.notFound,
                data: doc
              })          
            }
            return res.status(StatusCodes.success).json({
              status: StatusCodes.success,
              data: doc
            })
        })



    }

    static async getNotification(req, res) {

        let id = req.params.id;

        await RegNotificationModel.findById(id,(err,doc)=>{
            if(err) return res.status(400).send(err);
            if(doc === null){
             return res.status(StatusCodes.notFound).json({
                status: StatusCodes.notFound, 
                data: doc
              })          
            }
            return res.status(StatusCodes.success).json({
              status: StatusCodes.success,
              data: doc
            })
        })

    }

    static async updateNotifer(req, res) {

        let regData = {
            name: req.body.name,
            terminalId: req.body.terminalId,
            merchantId: req.body.merchantId,
            enabled: req.body.enabled  
        }

        let notificationService = {
            name: req.body.name,
            url: req.body.url,
            key: req.body.key,
            notificationClass: req.body.notificationClass,
            enabled: req.body.enabled

        }

        await RegNotificationModel.findOneAndUpdate({_id: req.params.id}, regData, {new: true}, (err, doc) => {


            if(err) return res.status(StatusCodes.serverError).send(err);
            if(doc === null){
              return res.status(StatusCodes.notFound).json({
                 status: StatusCodes.notFound
               })          
             }

             NotificationModel.findOneAndUpdate({_id: doc.notificationService}, 
                notificationService, {new: true}, (err, datas) => {
                if(err) {
                    console.log(err)
                } else {
                    console.log(datas)
                }
            });

            return res.status(StatusCodes.created).json({
              status: StatusCodes.success, 
              data: doc,
            });
           });
    }

    static async deleteNotifier(req, res) {
        let id = req.params.id;

        await RegNotificationModel.findByIdAndDelete(id, (err, doc) => {
          if(err) return res.status(StatusCodes.serverError).send(err);
          if(doc === null){
           return res.status(StatusCodes.notFound).json({
              status: StatusCodes.notFound
            })          
          }

          NotificationModel.findByIdAndDelete(doc.notificationService, 
            (err, data) => {});

          return res.status(StatusCodes.success).json({
            status: StatusCodes.success, 
            doc
          });
         });



    }

}

module.exports = NotificationController