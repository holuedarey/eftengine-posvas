const value_1 = '0EDAD09E1508496B7931E5D583AD46EF';

const value_2 = '32F2E0ABC7F4E5B9EF5246C8A82694D3';

let ksn_array = [];

let ksn = 'FFFF9876543210E00000';

ksn_array.push(ksn);

let encryptionBDK = '';

for(let i = 0; i < value_1.length;) {

    for( let j = 0; ( j < value_1.length && i < value_2.length ); j++, i++ ) {

        encryptionBDK += String.fromCharCode( value_1[i].charCodeAt(0).toString(8)
         ^ value_2[j].charCodeAt(0).toString(16));

    }

}

module.exports = {
    encryptionBDK, 
    ksn_array
}
