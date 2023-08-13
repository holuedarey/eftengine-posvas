const express = require('express');

const router = express.Router();

const Dukpt = require('dukpt');

const config = require('../config/config');

const encryptionConfig = require('../config/encryption');

const decryptionConfig = require('../config/decryption');

const incrementKSN = require('../handlers/incrementKSN');

let ksn_array = config.ksn_array;

const BDK = config.encryptionBDK;

router.post('/', (req, res) => {

    let plainText = req.body.plainText;

    let ksn = ksn_array[ksn_array.length - 1];

    const dukpt = new Dukpt(BDK, ksn);

    // const decryptedPIN = dukpt.dukptDecrypt(plainText, decryptionConfig);

    // console.log(decryptedPIN);

    const encryptedData = dukpt.dukptEncrypt(plainText, encryptionConfig);

    console.log(encryptedData);

    console.log(ksn);

    //After encrypting the data

    ksn_array.push(incrementKSN(ksn_array[ksn_array.length-1]));

    res.status(200).json({ encryptedData, ksn });

});

module.exports = {
    ksn_array,
    router,
    BDK
}