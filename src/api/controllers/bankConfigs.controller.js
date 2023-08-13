/**
 * @author Alayesanmi Femi
 * @author Adeyemi Adesola
 */
const BankConfig = require('../../model/bankconfigModel');
// const iswBankConfig = require('../../model/iswBankConfigModel');
const BankConfigProcessor = require('../processors/bankConfigs.processors');
const StatusCodes = require('../helpers/statusCodes');
const iswBankConfigModel = require('../model/iswBankConfigModel');

/**
 * @class BankConfigControllers
 * @description controller for all bank config routes
 * 
 */
class BankConfigControllers {
/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @memberof BankConfigControllers
 * @returns {JSON} api post route response
 */
  static async addConfig(req, res) {

    if(typeof req.body.selectors === "string"){
      req.body.selectors = req.body.selectors.split(',');
    }

    console.log(req.body);

    if(typeof req.body.useNibss_1 === "string") {
      req.body.useNibss_1 = req.body.useNibss_1 === "on" ? true : false ;
    }

    if(typeof req.body.useNibss_2 === "string") {
      req.body.useNibss_2 = req.body.useNibss_2 === "on" ? true : false ;
    }

    if(typeof req.body.useTams === "string") {
      req.body.useTams = req.body.useTams === "on" ? true : false ;
    }

    console.log(req.body);

    if(!BankConfigProcessor.isConfigPayloadValid(req.body).isValid){
      return res.status(StatusCodes.badRequest).json({
        status: StatusCodes.badRequest, 
        error: BankConfigProcessor.isConfigPayloadValid(req.body),
      });
    }

    let config = new BankConfig(req.body);

    BankConfig.findOne({
      name: req.body.name
    }).then(
      user => {
        if(user) {
          return res.status(StatusCodes.conflict).json({
            status: StatusCodes.conflict, 
            error: 'bank config already added',
           });
        } else {
          config.save((err, doc) => {
            if(err) return res.status(StatusCodes.serverError).send(err);
             return res.status(StatusCodes.created).json({
               status: StatusCodes.created, 
               data: doc,
             });
         })
        }
      }
    )



  }

  /**
   * 
   * @param {*} req 
   * @param {*} res 
   * @param {*} next 
   * @returns 
   */
  static async addIswConfig(req, res, next){
    try{
      // console.log(req.body, 'from request');
      let iswBankCreatedConfig = await iswBankConfigModel.create(req.body);
      console.log('ISW Bank Config', iswBankCreatedConfig);
      return res.json({error: false, message: 'Bank config successful', data: iswBankCreatedConfig});
    }catch(e){
      console.log(e, 'Error');
      next(e);
    }
  }

  /**
   * 
   * @param {*} req 
   * @param {*} res 
   * @param {*} next 
   * @returns 
   */
  static async updateIswConfig(req, res, next){
    try{
      // console.log(req.body, 'from request');
      console.log(req.body.filter, 'filter stuff');
      let iswBankCreatedConfig = await iswBankConfigModel.updateMany(filter, updateTodo);
      console.log('ISW Bank Config', iswBankCreatedConfig);
      return res.json({error: false, message: 'nothing', data: iswBankCreatedConfig});
    }catch(e){
      console.log(e, 'Error');
      next(e);
    }
  }

/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @memberof BankConfigControllers
 * @returns {JSON} api update config route response
 */
  static async updateConfig(req, res) {

    if(typeof req.body.useNibss_1 === "string") {

      req.body.useNibss_1 = req.body.useNibss_1 === "on" ? true : false ;

    }

    if(typeof req.body.useNibss_2 === "string") {

      req.body.useNibss_2 = req.body.useNibss_2 === "on" ? true : false ;

    }

    if(typeof req.body.useTams === "string") {

      req.body.useTams = req.body.useTams === "on" ? true : false ;

    }
  
  if(!BankConfigProcessor.isConfigUpdatePayload(req.body).isValid){
    return res.status(StatusCodes.badRequest).json({
      status: StatusCodes.badRequest, 
      error: BankConfigProcessor.isConfigUpdatePayload(req.body),
    });
      
  }

  await BankConfig.findOneAndUpdate({_id: req.params.id}, req.body, {new: true}, (err, doc) => {

    console.log(req.body)
    if(err) return res.status(StatusCodes.serverError).send(err);
    if(doc === null){
      return res.status(StatusCodes.notFound).json({
         status: StatusCodes.notFound
       })          
     }
    return res.status(StatusCodes.created).json({
      status: StatusCodes.success, 
      data: doc,
    });
   });
  
  }

  /**
 * 
 * @param {*} req 
 * @param {*} res 
 * @memberof BankConfigControllers
 * @returns {JSON} api delete config route response
 */
  static async deleteConfig(req, res) {
    let id = req.params.id;

    await BankConfig.findByIdAndDelete(id, (err, doc) => {
      if(err) return res.status(StatusCodes.serverError).send(err);
      if(doc === null){
       return res.status(StatusCodes.notFound).json({
          status: StatusCodes.notFound
        })          
      }
      return res.status(StatusCodes.success).json({
        status: StatusCodes.success, 
        doc
      });
     });
  }

/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @memberof BankConfigControllers
 * @returns {JSON} api get all config route response
 */
  static async getConfigs(req, res) {

    await BankConfig.find().sort({_id:'asc'}).exec((err,doc)=>{
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
/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @memberof BankConfigControllers
 * @returns {JSON} api get a config by _id route response
 */
  static async getSingleConfig(req, res) {
    let id = req.params.id;

    await BankConfig.findById(id,(err,doc)=>{
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

/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @memberof BankConfigControllers
 * @returns {JSON} api get a config by name or bank selectors route response
 */

 static async getConfigByNameorSelectors(req, res) {
    let reqData = req.body;

    await BankConfig.find(
      { 
        name: reqData.name
      }
    , 
    (err, data) => {
      if(err) return res.status(400).send(err);
      if(data.length === 0){
        return res.status(StatusCodes.success).json({
          data: `No configuration for ${reqData.name}`,
          dataSize: data.length
        })
      }
      return res.status(StatusCodes.success).json({
        data
      })
    })

 }



}
module.exports = BankConfigControllers;
