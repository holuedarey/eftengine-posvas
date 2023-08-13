const crypto = require('crypto');

const randomString = () => {
    let randomString = Math.floor(100000 + Math.random() * 900000);
    console.log('random string', randomString);
    return `${randomString}`;
};

const generateAccessToken = (message, algorithm, initVector, Securitykey) => {
    let cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);
    let encryptedData = cipher.update(message, "utf-8", "hex");
    encryptedData += cipher.final("hex");
    console.log(encryptedData,'encrypted');
    return encryptedData;
}

const verifyClientToken = (encryptedData, algorithm, initVector, Securitykey) => {
    const decipher = crypto.createDecipheriv(algorithm, Securitykey, initVector);
    let decryptedData = decipher.update(encryptedData, "hex", "utf-8");
    decryptedData += decipher.final("utf8");
    return decryptedData;
}

const padLeft = (data,padChar,length) => {
    let result = data
    if(!result) return "";
    while(result.length < length)
    {
        result = padChar + result;
    }
    return result;
}

const getReversalField90 = (unpackedMessage) => {
    let originalSN = unpackedMessage.dataElements[37].substr(6);
    let transDateandTime = unpackedMessage.dataElements[7];
    let acqCode = padLeft(unpackedMessage.dataElements[35].substr(0,6),"0",11);
    let originalForwardingInstCode = padLeft(unpackedMessage.dataElements[32],'0',11);
    let value = '0200'  + originalSN + transDateandTime + acqCode + originalForwardingInstCode;
    // console.log(value);
    return value;
}

const parseField62 = (field62Extract) => {
    let store = {};
    let start = 0;
    while(start < field62Extract.length) {
        let tag = field62Extract.slice(start+0, start+2);
        let len = field62Extract.slice(start+2, start+5);
        let value = field62Extract.slice(start+5, start+5 + parseInt(len));
        start = start+5 + parseInt(len);
        store[tag] = `${value}`;
    }
    return store;
}

const formatReversalAmount = (amount) => {
    return padLeft(amount.toString(), '0', 12);
}

const generateCardTrack2Data = (pan, restrictionCode, cardExpiry) => {
    return pan+'D'+cardExpiry+restrictionCode;
}

module.exports = {
    randomString,
    generateAccessToken,
    verifyClientToken,
    getReversalField90,
    padLeft,
    parseField62,
    formatReversalAmount,
    generateCardTrack2Data
}