"use strict";

class Unpack {

    constructor(binaryBitmap, dataElementPart, config = null){

        this.binaryBitmap = binaryBitmap;
        this.dataElementPart = dataElementPart;

        let defaultConfig = require(__dirname + '/dataelement-config.json');

        if(config !== null){

            this.config = config ;

        } else {

            this.config = defaultConfig;

        }

        this.dataElements = {};

    }

    getElement(field, currentDataElementPart,hexDataPart = false){

        let response = {};
        response.error = false;

        //Get the field data using the config
        let fieldConfig = this.config[field];
        let dataLength, variableLength, fieldLength, nextDataElementPart, fieldData;

        if(fieldConfig.fixedLength === true){

            variableLength = 0;
            dataLength = fieldConfig.contentLength;

        } else {

            //Get the number of length characters LL, LLL, etc
            variableLength = fieldConfig.contentLength;
            if(hexDataPart)
            {
                variableLength*= 2;
                dataLength = parseInt(Buffer.from(currentDataElementPart.substring(0, variableLength),'hex').toString('utf8')); 
            }
            else
                dataLength = parseInt(currentDataElementPart.substring(0, variableLength));

        }

        fieldLength = dataLength + variableLength;
        if(hexDataPart == true && fieldConfig.contentType != 'b')
        {    fieldLength= (dataLength*2)+variableLength;
            // fieldLength*= 2;
        }    

        fieldData = currentDataElementPart.substring(variableLength, fieldLength);
        if(hexDataPart)
        {
            if(fieldConfig.contentType != 'b' && field != 127)
                fieldData = Buffer.from(fieldData,'hex').toString('utf8');
        }

        nextDataElementPart = currentDataElementPart.substring(fieldLength);

        response.nextDataElementPart = nextDataElementPart;
        response.fieldNumber = field;
        response.fieldData = fieldData;
        response.fieldLength = fieldLength;
        response.dataLength = dataLength;
        response.slug = fieldConfig.slug;

        //TODO: Validate the field; length and value
        response.valid = true;

        return response;

    }

    getDataElements(hexDataPart = false){

        let currentDataElementPart = this.dataElementPart;

        //Loop through the Bitmap
        for(let i =  1; i < this.binaryBitmap.length; i++){

            let field = i + 1;
            let elementData;

            if(this.binaryBitmap[i] == "0"){

                //Field is not present
                this.dataElements[field] = null;

            } else {

                //Field is present
                elementData = this.getElement(field, currentDataElementPart,hexDataPart);

                this.dataElements[field] = elementData.fieldData;

                //Set the current data element part after taking out the data of the previous field
                currentDataElementPart = elementData.nextDataElementPart;

            }

        }

        return this.dataElements;

    }

}

module.exports = Unpack;

// b985527917e97b32efe5672e33e070bf963e073030303030303030303030303030303030303030303030303030303030
// b985527917e97b32efe5672e33e070bf

// 963e07