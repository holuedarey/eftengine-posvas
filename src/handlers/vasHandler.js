/**
 * @author Abolaji
 */

const ReportsModel = require('../model/reportsModel');
const Journal = require('../model/journalmodel');
const fetch = require('node-fetch');
const Util = require('../helpers/Util');
const http = require('https');
const fs = require('fs');
require('dotenv').config();


class VasHandler {


    /**
     * save vas journal   
     * @param {Object} jsonData request datap
     */
    async processVasJournal(jsonData) {
        try {
            let report = {
                type : jsonData.type,
                data : jsonData.data
            }

            let result = await ReportsModel.create(report);
            return result;
        } catch (error) {
            console.error(`Error saving vas journal at ${new Date.toString()}`);
            console.error(error.toString());
            return false;
        }
    }

    static async processVasRequest(journal, vasData){

        console.log(`Sending out vas request, tid : ${vasData.terminalId}, Body: ${JSON.stringify(vasData)} at ${new Date()}`);
        Util.fileDataLogger(vasData.terminalId,`Sending out vas request, tid : ${vasData.terminalId}, Body: ${JSON.stringify(vasData)} at ${new Date()}`);


        let baseBody = vasData.body;
        let baseJournal = vasData.journal;
        baseJournal.resp = journal.responseCode;
        baseJournal.acode = journal.authCode || "";

        baseBody.pfm.journal = baseJournal;
        vasData.body = {};

        let headers = Util.vasAuthorizationHeaderSimply(vasData,baseBody);




        console.log("sent header",JSON.stringify(headers));
        console.log("sent body",JSON.stringify(baseBody));

        let timeout = (1000 * 55);

        return fetch(vasData.host, {

                method: vasData.method,
                headers: headers,
                // agent: new http.Agent({
                //     pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                //     passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                //     rejectUnauthorized: false
                // }),
                body: JSON.stringify(baseBody),
                timeout: timeout

            })
            .then((response) => {

                return response.json().then((data) => {

                    console.log(`Response from vas request of ${vasData.terminalId}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(vasData.terminalId,`Response from vas request of ${vasData.terminalId}. Body: ${JSON.stringify(data)}`);
                
                    vasData.response = data;

                    Journal.updateOne({rrn : journal.rrn, customerRef : journal.customerRef, terminalId : journal.terminalId },{$set : {vasData : vasData}},(err,data)=>{
                        if(err)
                            console.error(`error updating vas data on journal at ${new Date().toString()} RRN : ${journal.rrn}`);
                        else
                        console.log(`vas data updated successfully at ${new Date().toString()} RRN : ${journal.rrn}`);
                    });
                    
                    return data;

                }).catch((err) => {

                    vasData.response =  response.toString();
                    
                    Journal.updateOne({rrn : journal.rrn, customerRef : journal.customerRef,terminalId : journal.terminalId },{$set : {vasData : vasData}},(err,data)=>{
                        if(err)
                            console.error(`error updating vasData on journal at ${new Date().toString()} RRN : ${journal.rrn}`);
                        else
                        console.log(`vas data updated successfully at ${new Date().toString()} RRN : ${journal.rrn}`);
                    });

                    console.log(`There was an error processing the JSON response from vas for ${journal.rrn}. Error: ${err}. The Response:`);
                    console.log("response",response);
                    Util.fileDataLogger(journal.terminalId,`There was an error processing the JSON response from vas for ${journal.rrn}. Error: ${err}. The Response: ${response.toString()}`);
                    
                    return false;
                });


            })
            .catch((err) => {

                vasData.response = err.toString();

                Journal.updateOne({rrn : journal.rrn, customerRef : journal.customerRef},{$set : {vasData : vasData}},(err,data)=>{
                    if(err)
                        console.error(`error updating vasData request result on journal at ${new Date().toString()} RRN : ${journal.rrn}`);
                    else
                    console.log(`VasData error result updated successfully at ${new Date().toString()} RRN : ${journal.rrn}`);
                });

                console.log(`There was an error sending notification of ${journal.rrn}. Error: ${err}`);
                Util.fileDataLogger(journal.terminalId,`There was an error sending vas request data ${journal.rrn}. Error: ${err}`);
                return false;

            });

    }






    static async processVas4Request(journal, vasData){


        // return false;

        let isVasComplete = journal.isVasComplete;

        let baseBody = vasData.body;
        let headers;
        // baseBody.accountType == "OFFLINE_PREPAID"
        // baseBody.accountType// OFFLINE_POSTPAID
        if(baseBody.validation_id){
            //CUstom VAS
            delete baseBody.locationData;
            delete baseBody.pin;
            delete baseBody.clientReference;
            delete baseBody.paymentMethod;
            baseBody.authCode = journal.authCode;
            baseBody.retrievalNumber = journal.rrn;
            baseBody.maskedPan = journal.maskedPan;
            vasData.body = baseBody;
            vasData.host = vasData.host + 'process-payment';
            headers = {
                'Content-Type': 'application/json',
                'validation-access-token': process.env.BEDC_VALIDATION_TOKEN
            }
        }else{
        vasData.body.interSwitchResponse = !!journal.interSwitchResponse ? journal.interSwitchResponse : null;

        vasData.body.upslResponse = !!journal.upslResponse ? journal.upslResponse : null;

        vasData.body.responseCode = journal.responseCode;

        baseBody.card = vasData.card;
        // let baseJournal = vasData.journal;
        // baseJournal.resp = journal.responseCode;
        // baseJournal.acode = journal.authCode || "";

        baseBody.card["handlerUsed"] = journal.handlerUsed;

        //change the rrn here
        baseBody.card["rrn"] = journal.rrn;

        // baseBody.pfm.journal = baseJournal;
        vasData.body = baseBody;
        headers = vasData.headers;
        }

        Util.fileDataLogger(vasData.terminalId,`Sending out vas 4.0 request, tid : ${vasData.terminalId}, Headers: ${JSON.stringify(vasData.headers)} Body: ${JSON.stringify(vasData.body)} at ${new Date()}`);
        // Util.fileDataLogger(vasData.terminalId,`Sending out vas 4.0 Headers, tid : ${vasData.terminalId},  at ${new Date()}`);

        //let headers = Util.vasAuthorizationHeaderSimply(vasData,baseBody);

        // console.log("sent header",JSON.stringify(headers));
        // console.log("sent body",JSON.stringify(baseBody));

        let timeout = (1000 * 55);

        return fetch(vasData.host, {

                method: vasData.method,
                headers: headers,
                // agent: new http.Agent({
                //     pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                //     passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                //     rejectUnauthorized: false
                // }),
                body: JSON.stringify(baseBody),
                timeout: timeout

            })
            .then((response) => {

                return response.json().then((data) => {

                    console.log(`Response from vas 4.0 request of ${vasData.terminalId}. Body: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(vasData.terminalId,`Response from vas 4.0 request of ${vasData.terminalId}. Body: ${JSON.stringify(data)}`);
                
                    vasData.response = data;
                    if(data.responseCode === "00" || (data.response && data.response.statusCode === "00")) {
                        isVasComplete = true;
                    }

                    Journal.updateOne({rrn : journal.rrn, 
                        customerRef : journal.customerRef,
                        terminalId : journal.terminalId },{$set : { vasData : vasData, isVasComplete }},(err,data)=>{
                        if(err)
                            console.error(`error updating vas 4.0 data on journal at ${new Date().toString()} RRN : ${journal.rrn}`);
                        else
                        console.log(`vas 4.0 data updated successfully at ${new Date().toString()} RRN : ${journal.rrn}`);
                    });

                    // Demo test for vas4.0
                    return data;
                }).catch((err) => {

                    vasData.response =  response.toString();
                    
                    Journal.updateOne({rrn : journal.rrn, customerRef : journal.customerRef,terminalId : journal.terminalId },{$set : { vasData : vasData, isVasComplete }},(err,data)=>{
                        if(err)
                            console.error(`error updating vas4Data on journal at ${new Date().toString()} RRN : ${journal.rrn}`);
                        else
                        console.log(`vas 4.0 data updated successfully at ${new Date().toString()} RRN : ${journal.rrn}`);
                    });

                    // console.log(`There was an error processing the JSON response from vas for ${journal.rrn}. Error: ${err}. The Response:`);
                    // console.log("response",response);
                    // console.log("response TO String",response.toString());
                    Util.fileDataLogger(journal.terminalId,`There was an error processing the JSON response from vas for ${journal.rrn}. Error: ${err}. The Response: ${JSON.stringify(response)}`);
                    
                    return false;
                });

            })
            .catch((err) => {

                vasData.response = err.toString();

                Journal.updateOne({rrn : journal.rrn, customerRef : journal.customerRef},{$set : { vasData : vasData, isVasComplete}},(err,data)=>{
                    if(err)
                        console.error(`error updating vasData request result on journal at ${new Date().toString()} RRN : ${journal.rrn}`);
                    else
                    console.log(`VasData error result updated successfully at ${new Date().toString()} RRN : ${journal.rrn}`);
                });

                console.log(`There was an error sending notification of ${journal.rrn}. Error: ${err}`);
                Util.fileDataLogger(journal.terminalId,`There was an error processing the JSON response from vas for ${journal.rrn}. Error: ${JSON.stringify(err)}. The Response: ${err.toString()}`);
                // Util.fileDataLogger(journal.terminalId,`There was an error sending vas request data ${journal.rrn}. Error: ${err}`);
                return false;

            });

    }

}


module.exports = VasHandler;