require('dotenv').config();
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const http = require('https');
const localData = require('./location-data.json');
const Util = require('./Util');
const Merchants = require('../model/merchantsModel');


class NetworkUtil{

    static async getGeoData(cloc){

        let locations = localData || [];

        let location = locations.find(c=>c.cloc == cloc);
        if(location){
            return location.data;
        }

        let bdy = {
            token: "70083458096276",
            radio: "gsm",
            mcc: Number(cloc.mcc),
            mnc: Number(cloc.mnc),
            cells: [{
                lac: parseInt(cloc.lac, 16),
                cid: parseInt(cloc.cid, 16),
            }],
            address: 1,
        }

        console.log('request: '+ JSON.stringify(bdy))

        return fetch("https://us1.unwiredlabs.com/v2/process.php",{

                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(bdy)
        }).then(response => {
            return response.json().then(data=>{

                if(data.status == "ok"){
                    NetworkUtil.writeData({cloc : cloc, data : data});
                    return data;
                }

                return false;

            }).catch(err=>{
                console.error(`error parsing Geo Data, ${err}`);
                return false;
            })
        }).catch(err=>{
            console.error(`error fetching Geo Data, ${err}`);
            return false
        })
    }

    static writeData(data){
        let locations = localData || [];
        locations.push(data);
        fs.writeFileSync(path.join(__dirname, 'location-data.json'), JSON.stringify(locations));
    }

    static async sendStanbicTermNotification(state){

        if(!state.terminalId) return;
        let bankCode = Util.bankfromTID(state.terminalId,true);
        if(bankCode != 'STANBIC') return;

        if(!state['stateData']) return;

        let stateData = state['stateData'];

        let notificationHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization' : 'U2FsdGVkX1/AFbdapfFKZi3/TOpps8t6ZFWsgOKO/Xg05l/rdEytAP5AXxRe8inH'
        }

        fetch(`${process.env.stanbic_url}/api/v1/process/terminals`, {

            method: 'post',
            headers: notificationHeaders,
            body: JSON.stringify(stateData),
            agent: new http.Agent({
                pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                rejectUnauthorized: false
            })

        })
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from stanbic callhome notification: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(stateData.tid,`Response from stanbic callhome notification: ${JSON.stringify(data)}`);


                }).catch((err) => {

                    console.error(`There was an error processing the JSON response from stanbic callhome. The Response: ${response.toString()}`);
                    Util.fileDataLogger(stateData.tid,`There was an error processing the JSON response from stanbic callhome. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {
                console.error(`There was an error sending static callhome. Error: ${err}`);
                Util.fileDataLogger(stateData.tid,`There was an error sending static callhome. Error: ${err}`);

            });
    }

    static sendLoyalityRequest(transactionData){

        if(transactionData.responseCode != '00') return;
        
        let customerData  = Util.getCustomJson(transactionData);
        if(!customerData) return;
        
        if(!customerData['loyalityData'] ) return;

        let body  = {
            func: "promo1",
            ref: transactionData.rrn,
            phoneAgent: customerData.loyalityData.phoneAgent,
            phoneCustomer: customerData.loyalityData.phoneCustomer,
            mccCode: transactionData.merchantCategoryCode,
            terminalId: transactionData.terminalId,
            amount: transactionData.amount
        }

        console.log(`loyality request for ${transactionData.terminalId}, rrn : ${transactionData.rrn}, time: ${transactionData.transactionTime}, ${JSON.stringify(body)}`);
        Util.fileDataLogger(transactionData.terminalId,`loyality request for ${transactionData.terminalId}, rrn : ${transactionData.rrn}, time: ${transactionData.transactionTime}, ${JSON.stringify(body)}`);

        let reqHeaders = {

            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        let url = process.env.loyality_url;

        fetch(url,{
            method : "POST",
            headers : reqHeaders,
            body : JSON.stringify(body)
        }).then(response =>{
            response.json().then(data =>{
                console.log(`response from loyality request ${transactionData.terminalId}, ${transactionData.rrn}, at ${new Date()}, ${JSON.stringify(data)}`)
                Util.fileDataLogger(transactionData.terminalId,`response from loyality request ${transactionData.terminalId}, ${transactionData.rrn}, at ${new Date()}, ${JSON.stringify(data)}`)
            })
            .catch(err=>{
                console.log(`error parsing response into JSON ${transactionData.terminalId}, ${transactionData.rrn}, at ${new Date()}, ${response.toString()}`)
                Util.fileDataLogger(transactionData.terminalId,`error parsing response into JSON ${transactionData.terminalId}, ${transactionData.rrn}, at ${new Date()}, ${response.toString()}`)
            })
        }).catch(err=>{
            console.log(`error sending loyality request ${transactionData.terminalId}, ${transactionData.rrn}, at ${new Date()}, ${err}`);
            Util.fileDataLogger(transactionData.terminalId,`error sending loyality request ${transactionData.terminalId}, ${transactionData.rrn}, at ${new Date()}, ${err}`);
        })
    }

    static async sendGtbTermNotification(state){

        if(!state.terminalId) return;
        let bankCode = Util.bankfromTID(state.terminalId,true);
        if(bankCode != 'GTBANK') return;

        if(!state['stateData']) return;

        let stateData = state['stateData'];

        let notificationHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization' : '364aae848ab96903608e6b5821c850c28feddf43549ab08c570b6ff90646d093'
        }

        fetch(`${process.env.gtbreport_url}/api/terminal/callhome`, {

            method: 'post',
            headers: notificationHeaders,
            body: JSON.stringify(stateData),
            agent: new http.Agent({
                pfx: fs.readFileSync(process.env.CERTIFICATES_PFX_PATH),
                passphrase: process.env.CERTIFICATES_PFX_PASSPHRASE,
                rejectUnauthorized: false
            })

        })
            .then((response) => {
                response.json().then((data) => {

                    console.log(`Response from gtb callhome notification: ${JSON.stringify(data)}`);
                    Util.fileDataLogger(stateData.tid,`Response from stanbic gtb notification: ${JSON.stringify(data)}`);


                }).catch((err) => {

                    console.error(`There was an error processing the JSON response from gtb callhome. The Response: ${response.toString()}`);
                    Util.fileDataLogger(stateData.tid,`There was an error processing the JSON response from gtb callhome. The Response: ${response.toString()}`);

                });


            })
            .catch((err) => {
                console.error(`There was an error sending gtb callhome. Error: ${err}`);
                Util.fileDataLogger(stateData.tid,`There was an error sending gtb callhome. Error: ${err}`);

            });
    }

}

module.exports = NetworkUtil;