//const permissions = require('../helpers/permissions');
const hashPassword = require('../helpers/hashPassword');
const checkPassword = require('../helpers/checkPassword');
const AuthProcessor = require('../processors/auth.processors'); 
const StatusCodes = require('../helpers/statusCodes');
const tokenOperations = require('../helpers/tokenOperations');
const config = require('../config/config');
const jwt = require('jsonwebtoken');


const usersModel = require('../../model/usersModel');

class AuthControllers {

    static async addUser(req, res) {
        let data = req.body;
        data.permissions = ['USER'];
        
        let isValidPayload = await AuthProcessor.isValidAuthPayload(req.body).isValid
        if(isValidPayload === false){
            return res.status(StatusCodes.badRequest).json({
            status: StatusCodes.badRequest,
            error: await AuthProcessor.isValidAuthPayload(req.body),
            });
        }

        data.password = hashPassword(req.body.password);
        let user = new usersModel(data);

        await user.save((err, doc) => {
            if(err) return res.status(StatusCodes.serverError).send(err);
             return res.status(StatusCodes.created).json({
               status: StatusCodes.created, 
               data: doc,
             });
         })
      
    } 

    static async loginUser(req, res) {

        let data = req.body;

        await usersModel.findOne({ username: data.username })
        .exec((err, user) => {
            if(err) return res.status(StatusCodes.serverError).send(err);
            if(!user){
                return res.status(StatusCodes.notFound).json({
                    error: 'User does not exist'
                });
            }
            if(!checkPassword(data.password, user.password)){
                return res.status(StatusCodes.notFound).json({
                    error: 'Incorrect Password'
                });
            }

            const authUser = {
                username: user.username,
                permissions: user.permissions,
            }
            let token = jwt.sign(
                authUser, config.SECRET_KEY,
                { expiresIn: '24h' },
              );

            return res.status(StatusCodes.created).json({
                token,
              });
            
        });
    }
    
}

module.exports = AuthControllers;
