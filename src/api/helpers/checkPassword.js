const bcrypt = require('bcrypt');

const checkPassword = (password, userPassword) => {
  const isValid = bcrypt.compareSync(password, userPassword);
  return isValid;
};

module.exports = checkPassword;
