/**
 * @author Alayesanmi Femi
 * @author Adeyemi Adesola
 * @description api global configurations
 */
 require('dotenv').config();

const config = {
    default: {
        DATABASE_URL: 'mongodb://localhost:27017/bankconfigs',
        SECRET_KEY: process.env.API_SECRET_KEY,
        CLIENT_SECRET_KEY: process.env.CLIENT_SECRET_KEY,
        INIT_VECTOR_KEY: process.env.INIT_VECTOR_KEY,
        SECURE_VECTOR_KEY: process.env.SECURE_VECTOR_KEY,
        ALGORITHM: process.env.ALGORITHM,
        TOKEN_EXPIRY: process.env.TOKEN_EXPIRY,
    }
}

module.exports = config.default;