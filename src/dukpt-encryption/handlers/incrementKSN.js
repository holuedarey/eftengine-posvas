const incrementKSN = (ksn) => {    

    let ksn_length = ksn.length;

    let first_part = ksn.substring(0, ksn_length - 5);

    let counter = ksn.substring(ksn_length - 4);

    let counterValue = parseInt(counter, 10);

    counterValue = counterValue + 1;

    let counterValueStr = counterValue.toString();

    if (counterValueStr.length == 1){

        counterValueStr = '0000' + counterValueStr;

    } else if (counterValueStr.length == 2) {

        counterValueStr = '000' + counterValueStr;

    } else if (counterValueStr.length == 3 ) {

        counterValueStr = '00' + counterValueStr;

    }else if (counterValueStr.length == 4 ) {

        counterValueStr = '0' + counterValueStr;

    } else {
        counterValueStr = '' + counterValueStr;
    }


    if(counterValue == 99999) {

        counterValue = 00000;

    }

    ksn = first_part + counterValueStr;

    return ksn;

}

module.exports = incrementKSN;