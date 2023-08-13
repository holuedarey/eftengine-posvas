const jwt = require('jsonwebtoken');


class TokenOperations  {
  static async generateToken (user, secretKey) {
    const authToken = await jwt.sign(
      user, secretKey,
      { expiresIn: '24h' },
    );
    return authToken;
  }


};



module.exports = TokenOperations;
