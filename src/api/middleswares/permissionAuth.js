const jwt = require('jsonwebtoken');
const Response = require('../helpers/Response');
const responseStatusCodes = require('../helpers/statusCodes');
const { verifyClientToken } = require('../helpers/utils');
const config = require('../config/config');

class PermissionAuth {
    static isUser(req, res, next) {
        let authToken = jwt.verify(req.headers.authorization, process.env.API_SECRET_KEY);
        let permissions = []
        if(authToken.permissions.includes('USER')) {
            next();
        } else {
            return Response.handleError(res, responseStatusCodes.forbidden, 'restricted action for only users');
        }

    }
    
    static isAdmin(req, res, next) {
        let authToken = jwt.verify(req.headers.authorization, process.env.API_SECRET_KEY);
        let permissions = []
        if(authToken.permissions.includes('ADMIN')) {
            next();
        } else {
            return Response.handleError(res, responseStatusCodes.forbidden, 'restricted action for only an admin');
        }
    }

    static verifyToken(req, res, next) {
        const authToken = req.body.token || req.query.token
            || req.headers['x-access-token']
            || req.headers.Authorization || req.headers.authorization;
    
        if (!authToken) {
          return Response.handleError(res, responseStatusCodes.badRequest,
            'token must be provided');
        }
        try {
          let decoded = jwt.verify(req.headers.authorization, process.env.API_SECRET_KEY);
          if (!decoded) {
            return Response.handleError(res, responseStatusCodes.badRequest,
              'invalid token provided');
          }
      
          const expired = decoded.exp < Date.now() / 1000 ? true : false;
      
          if (!expired) {
            next();
          } else {
            return Response.handleError(res, responseStatusCodes.badRequest,
              'token has expired');
          }
         
        } catch (error) {
            
          return Response.handleError(res, responseStatusCodes.badRequest,
            error.message);
        }
    }

    static verifyClient(req, res, next){
      //Can be used for other banks. ==> Make a check for their own secret key.
      let authToken = req.body.token || req.query.token
          || req.headers['x-access-token']
          || req.headers.Authorization || req.headers.authorization;
  
      if (!authToken) {
        return Response.handleError(res, responseStatusCodes.badRequest,
          'token must be provided');
      }
      // console.log('authToken before check', authToken);
      if(authToken.startsWith('Bearer')){
        authToken = authToken.split(" ")[1];
      }
      // console.log('authToken', authToken);
      authToken = authToken.slice(-64)
      if(authToken.length > 64){
        return Response.handleError(res, responseStatusCodes.badRequest,
          'token value invalid');
      }
      console.log(authToken,'authtoken');
      console.log(config.ALGORITHM,'config.ALGORITHM');
      console.log(config.INIT_VECTOR_KEY,'config.INIT_VECTOR_KEY');
      console.log(config.SECURE_VECTOR_KEY,'config.SECURE_VECTOR_KEY');
      let serverSecret = verifyClientToken(authToken, config.ALGORITHM, Buffer.from(config.INIT_VECTOR_KEY), Buffer.from(config.SECURE_VECTOR_KEY));
      // console.log(serverSecret,'secret stuff...');
      if(serverSecret !== config.CLIENT_SECRET_KEY){
        return Response.handleError(res, responseStatusCodes.badRequest,
          'invalid token provided');
      }
      next();

      // const expired = parseInt(config.TOKEN_EXPIRY) < Date.now() / 1000 ? true : false;
      //     if (!expired) {
      //       next();
      //     } else {
      //       return Response.handleError(res, responseStatusCodes.badRequest,
      //         'token has expired');
      //     }

    }

}

module.exports = PermissionAuth;