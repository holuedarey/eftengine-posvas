/**
 * @author Abolaji
 */
require('dotenv').config();
const Util = require('../helpers/Util');
const ProvidusNotifier = require('../notifications/notifiers/providusnotifier');
const FrscNotifier = require('../notifications/notifiers/frscnotifier');
const SterlingNotifier = require('../notifications/notifiers/sterlingnotifier');
const RsuthNotifier = require('../notifications/notifiers/rsuthnotifier');
const IgrNotifier = require('../notifications/notifiers/igrnotifier');
const HapagNotifier = require('../notifications/notifiers/hapagnotifier');
const JambprcNotifier = require('../notifications/notifiers/jambnotifier');
const RemitaNotifier = require('../notifications/notifiers/remitanotifier');
const IgrParkwayNotifier = require('../notifications/notifiers/igrparkwaynotifier');
const IgrParkwayzNotifier = require('../notifications/notifiers/igrparkwayznotifier');
const RemitaCollectNotifier = require('../notifications/notifiers/remitacollectnotifier');
const StanbicDstvNotifier = require('../notifications/notifiers/stanbicdstvnotifier');
const ArteziaNotifier = require('../notifications/notifiers/artezianotifier');
const VasRequest = require('../handlers/vasHandler');
const WemaNotifier = require('../notifications/notifiers/wemanotifier');
const OyoStateInstitutionNotifier = require('../notifications/notifiers/oyostateinstitutionotifier');
const C24Notifier = require('../notifications/notifiers/c24notifier');
const MirkoNotifier = require('../notifications/notifiers/mikronotifier');
const FlutterNotifier = require('../notifications/notifiers/flutternotifier');
const axios = require('axios');
const fetch = require('node-fetch')
const Journal = require('../model/journalmodel');

class ResponseMiddleware {

    constructor(unpackedRequest, unpackedResponse,transactionDetails, vasData = null, remittaData = null, stanbicdstvdata = null, vas4Data = null, jambprcData = null) {
        this.unpackedRequest = unpackedRequest;
        this.unpackedResponse = unpackedResponse;
        this.transactionDetails = transactionDetails;
        this.vasData = vasData;

        this.vas4Data = vas4Data;
        this.remittaData = remittaData;
        this.stanbicdstvdata = stanbicdstvdata;
        this.jambprcData = jambprcData;
    }

    /**
     * list of conditions to make use of response-middleware
     * @returns {Boolean}
     */
    isMiddlewareNeeded() {
        return (
            this.isProvidusNotification() ||
            this.isFrscNotification() ||
            this.isFrscSterlingNotification() ||
            this.isRsuthNotification() ||
            this.isIgrNotification() ||
            this.isHapagNotification() ||
            this.isJambprcNotification() ||
            this.isRemitaNotification() || 
            this.isRemitaCollectNotification() || 
            this.isStanbicDstvNotification() || 
            this.isVasRequestRequired() || 
            this.isWemaCollectNotification() ||
            this.isIgrParkwayNotification() || 
            this.isArteziaNotification() || 
            this.isOyostateInstitutionPos() ||
            this.isC24Notification()
            || this.isIgrParkwayzNotification()
            || this.isFlutterNotification()
        )
    }

    async preformMiddlewareActions(){
        let result = {
            isSuccess : false,
            errorDoReversal : false
        };

        if(this.isProvidusNotification())
        {
            result.errorDoReversal = true;
            result.isSuccess = await this.sendProvidusNotification();
        }
        else if(this.isFrscNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendFrscNotification();
        }
        else if(this.isFrscSterlingNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendFrscSterlingNotification();
        }
        else if(this.isRsuthNotification()){
            result.errorDoReversal = true;
            let res = await this.sendRsuthNotification();

            if(typeof(res) == 'object'){
                result.isSuccess = false;
                result.message = res.message
            }else
            {
                result.isSuccess = res;
            }
        }
        else if(this.isIgrNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendIGRNotification();
         } else if(this.isHapagNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendHAPAGNotification();
        } 
        else if(this.isJambprcNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendJambPrcNotification();
        } 
        else if(this.isIgrParkwayNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendIGRParkwayNotification();
        } else if(this.isIgrParkwayzNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendIGRParkwayzNotification();
        } else if(this.isC24Notification()) {
            
            result.errorDoReversal = true;
            result.isSuccess = await this.sendC24Notification();

        } 
        else if(this.isFlutterNotification()) {
            
            result.errorDoReversal = true;
            result.isSuccess = await this.sendFlutterWaveNotification();

        }
        else if(this.isRemitaNotification()){
            result.errorDoReversal = false;
            result.isSuccess = await this.sendRemitaNotification();
        }else if(this.isRemitaCollectNotification()){
            result.errorDoReversal = false;
            result.isSuccess = await this.sendRemitaCollectNotification();
        } else if(this.isStanbicDstvNotification()){
            result.errorDoReversal = true;
            result.isSuccess = await this.sendStanbicDstvNotification();
        } else if(this.isOyostateInstitutionPos()){
            result.errorDoReversal = false;
            result.isSuccess = await this.saveTransactionIdForOyoStateInstitution();
        }
        else if(this.isVasRequestRequired()){

            // for test initiate reversals 
            result.errorDoReversal = false;
            // result.errorDoReversal = false;

            result.isSuccess =  await this.sendVasRequest();
        }
        else if(this.isWemaCollectNotification()){
            result.errorDoReversal = true;
            result.isSuccess =  await this.sendWemaCollectNotification();
        } else if(this.isArteziaNotification()){
            result.errorDoReversal = true;
            result.isSuccess =  await this.sendArteziaNotification();
        } else if(this.isFlutterNotification()) {
            result.errorDoReversal = true;
            result.isSuccess =  await this.sendFlutterWaveNotification();
            console.log("result.isSuccess: ", result.isSuccess)
        }

        return result;
    }

    /**
     * conditions required to do providus notification
     * @returns {Boolean}
     */
    isProvidusNotification() {
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
        
        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.getCustomerRefData(this.unpackedRequest).startsWith(process.env.providus_identifier)
        )
    }

    isOyostateInstitutionPos() {

        if(!Util.getCustomerRefData(this.unpackedRequest))
        return false;
    
        return Util.getCustomerRefData(this.unpackedRequest).startsWith(process.env.oyostateinstition_identifier)
        
    }

    async sendArteziaNotification(){
        let arteziaNotifier = new ArteziaNotifier(this.transactionDetails);
        let isSuccess = await arteziaNotifier.sendNotification();

        // console.log(`is succ ${isSuccess}`);

        if(!isSuccess){
            // do rollback
            return false;
        }

        return true;
    }

    async sendProvidusNotification(){
        let providusNotifier = new ProvidusNotifier(this.transactionDetails);
        let isSuccess = await providusNotifier.sendNotification();

        // console.log(`is succ ${isSuccess}`);

        if(!isSuccess){
            // do rollback
            return false;
        }

        return true;
    }

    isFrscNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;

        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isFRSCPOS(this.unpackedRequest)
        )
    }
    
    isFrscSterlingNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;

        console.log("Is Sterling POS: ", Util.isSTERLINGPOS(this.unpackedRequest));

        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isSTERLINGPOS(this.unpackedRequest)
        )
    }

    async sendFrscNotification(){
        console.error("sending notification");
        let frscNotifier = new FrscNotifier(this.transactionDetails);
        let isSuccess = await frscNotifier.sendNotification();

        // console.log(`is succ ${isSuccess}`);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }
    async sendFrscSterlingNotification(){
        console.error("sending notification for FRSC Sterling");
        let frscNotifier = new SterlingNotifier(this.transactionDetails);
        let isSuccess = await frscNotifier.sendNotification();

        console.log(`is succ ${isSuccess}`);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    isRsuthNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;

        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isRSUTHPOS(this.unpackedRequest)
        )
    }

    async sendRsuthNotification(){
        console.error("sending notification");
        let rsuthNotifier = new RsuthNotifier(this.transactionDetails);
        let isSuccess = await rsuthNotifier.sendNotification();

        // console.log(`is succ ${isSuccess}`);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }


    isIgrNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;

        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isIGRPOS(this.unpackedRequest)
        )
    }

    async sendIGRNotification(){
        console.error("sending IGR notification");
        let igrNotifier = new IgrNotifier(this.transactionDetails);
        let isSuccess = await igrNotifier.sendNotification();

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    isHapagNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;

        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isHAPAGPOS(this.unpackedRequest)
        )
    }


    isJambprcNotification() {
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
        return false;

        return (
           Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isJAMBPRCPOS(this.unpackedRequest) && this.jambprcData !== null
        )
    }

    async sendHAPAGNotification(){
        console.error("sending HAPAG notification");
        let hapagNotifier = new HapagNotifier(this.transactionDetails);
        let isSuccess = await hapagNotifier.sendNotification();

        console.log("Is Success Response: ", isSuccess);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    async sendJambPrcNotification(){

        console.error("Sending Jamb-prc notification");
        let jambprcNotifier = new JambprcNotifier(this.transactionDetails);
        let isSuccess = await jambprcNotifier.sendNotification(this.jambprcData);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }


    isVasRequestRequired(){
        if(this.unpackedRequest.mti != '0200' || (this.vasData == null && this.vas4Data == null))
            return false;
        
        return (Util.getResponseCode(this.unpackedResponse) == '00' &&
        (this.vasData != null || this.vas4Data != null))
    }



    async sendVasRequest(){
        let terminalId = Util.getTerminalId(this.unpackedRequest);
        let isValid = this.vas4Data != null ? Util.validateVAS4Request(terminalId, this.vas4Data) : Util.validateVasRequest(terminalId, this.vasData);

        if(!isValid){
            return false;
        }

        let isSuccess = this.vas4Data != null ? await VasRequest.processVas4Request(this.transactionDetails, this.vas4Data) : await VasRequest.processVasRequest(this.transactionDetails,this.vasData);

        if(isSuccess == false){
            return false;
        }

        // console.log("Vas response after Debit occured",isSuccess);
        return isSuccess;
    }



    isRemitaNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isRemitaPOS(this.unpackedRequest)
        )
    }

    isIgrParkwayNotification()  {

        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
            
        return (
          Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isIGRParkwayPOS(this.unpackedRequest)
        )

    }

    isFlutterNotification()  {

        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
            
        return (
          Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isFlutterPOS(this.unpackedRequest)
        )
    }

    isIgrParkwayzNotification()  {

        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
        
        // console.log("here right now: ", Util.isIGRParkwayPOS(this.unpackedRequest));
        
        return (
          Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isIGRZParkwayPOS(this.unpackedRequest)
        )

    }


    isC24Notification()  {

        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
            
        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isC24POS(this.unpackedRequest)
        )

    }

    isMikroNotification()  {

        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
            
        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isMikroPOS(this.unpackedRequest)
        )

    }

    isArteziaNotification()  {

        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;
            
        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isArteziaPOS(this.unpackedRequest)
        )

    }


    async sendC24Notification(){
        console.error("sending C24 notification");
        let c24Notifier = new C24Notifier(this.transactionDetails);
        let isSuccess = await c24Notifier.sendNotification();

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    async sendMikroNotification(){
        console.error("sending MIKRO notification");
        let mikronotifier = new MirkoNotifier(this.transactionDetails);
        let isSuccess = await mikronotifier.sendNotification();

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    async sendFlutterWaveNotification(){
        console.error("sending FLutter notification");
        let flutternotifier = new FlutterNotifier(this.transactionDetails);
        let isSuccess = await flutternotifier.sendNotification();

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    async sendRemitaNotification(){
        console.error("sending Remita notification");
        let remitaNotifier = new RemitaNotifier(this.transactionDetails);

        let isSuccess = await remitaNotifier.sendNotification();

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess.responseId;
    }

    async sendIGRParkwayNotification(){
        console.error("sending IGR Parkway notification");
        let igrParkwayNotifier = new IgrParkwayNotifier(this.transactionDetails);
        let isSuccess = await igrParkwayNotifier.sendNotification();

        console.log(isSuccess, "Parkways notification status");

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    async sendIGRParkwayzNotification(){
        console.error("sending IGR Parkway Zenith notification");
        let igrParkwayzNotifier = new IgrParkwayzNotifier(this.transactionDetails);
        let isSuccess = await igrParkwayzNotifier.sendNotification();

        console.log(isSuccess, "Parkways Zenith notification status");

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }



    isRemitaCollectNotification(){
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
            return false;

        return (
            Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isRemitaCollectPOS(this.unpackedRequest) && this.remittaData !== null
        )
    }

    isStanbicDstvNotification() {
        if(this.unpackedRequest.mti != '0200' || !Util.getCustomerRefData(this.unpackedRequest))
        return false;

        return (
           Util.getResponseCode(this.unpackedResponse) == '00' &&
            Util.isStanbicDstvPOS(this.unpackedRequest) && this.stanbicdstvdata !== null
        )
    }

    async sendRemitaCollectNotification(){
        console.error("sending Remita-collect notification");
        let remitaNotifier = new RemitaCollectNotifier(this.transactionDetails);
        /*
        let isSuccess = await remitaNotifier.sendNotification(this.remittaData);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
        */

        remitaNotifier.sendNotification(this.remittaData)
        return true;
    }

    async sendStanbicDstvNotification(){
        console.error("Sending Stanbic-DSTV notification");
        let stanbicDstvNotifier = new StanbicDstvNotifier(this.transactionDetails);
        let isSuccess = await stanbicDstvNotifier.sendNotification(this.stanbicdstvdata);

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

    async saveTransactionIdForOyoStateInstitution() {

        console.error("Saving OyoState TransactionId for Callback");
        let oyoStateNotifier = new OyoStateInstitutionNotifier(this.transactionDetails);
        let isSuccess = await oyoStateNotifier.saveTransactionId();

        return isSuccess;

    }


    isWemaCollectNotification(){
        if(!Util.getCustomerRefData(this.unpackedRequest))
            return false;            

        if(
           ! Util.isWemaCollectPOS(this.unpackedRequest) ||
            (this.transactionDetails.MTI == "0200" && Util.getResponseCode(this.unpackedResponse) != '00' ))
            return false;

        return Util.isWemaCollectPOS(this.unpackedRequest)
    }

    async sendWemaCollectNotification(){
        let wemaNotifier = new WemaNotifier(this.transactionDetails);
        let isSuccess = await wemaNotifier.sendNotification();

        if(isSuccess == false){
            // do rollback
            return false;
        }

        return isSuccess;
    }

}

module.exports = ResponseMiddleware;