const journalModel = require('../../model/journalmodel');
const NotificationServiceModel = require('../../model/notificationservicemodel');
const path = require('path');
const NotifierFolderPath = path.resolve(__dirname, '../../notifications/notifiers');
const moment = require('moment-timezone');
class AutoNotifications {
    constructor(){

    }

    async findUnNotifiedTransactions(){
            let startDate = moment().subtract(2, 'd').tz("Africa/Lagos").toDate();
            let endDate = moment().tz("Africa/Lagos").toDate();
            
            const foundTransactions = await journalModel.find({
                isNotified: false,
                transactionTime: {
                    $gte: startDate,
                    $lte: endDate
                }
            }).sort({_id: -1})
            return foundTransactions;
    }

    replaceIdentifier(identifier){
        if(identifier == 'mikr'){
            identifier = 'mikro';
        }
        return identifier;
    }

    getIdentifierfromCustomRef(journal){
        let customerRef = "";
        if (journal.customerRef){
            customerRef = journal.customerRef;
        }
        return customerRef.split('~')[0];
    }

    findNotifierClassModule(identifier){
        try{
            identifier = this.replaceIdentifier(identifier);
            let notifierClassModule = require(NotifierFolderPath + '/' + identifier + 'notifier.js');
            return notifierClassModule;
        }catch(e){
            console.log(e.message);
            return "";
        }
    }

    async findServiceOptions(identifier){
        identifier = this.replaceIdentifier(identifier);
        const notificationClass = identifier + 'notifier';
        return await NotificationServiceModel.findOne({notificationClass});
    }

    async sendNotifications(){
    try{
        const tracker = 0;
        let foundDocs = await this.findUnNotifiedTransactions();
        if(!foundDocs || foundDocs.length === 0) {
            console.log('No found Transactions...');
            return {message: `Transactions not found`};
        }
        console.log(`Found...`,foundDocs.length, `transactions`);
        
        for(let journal of foundDocs){
            const identifier = this.getIdentifierfromCustomRef(journal);
            if (identifier === "" || !identifier) continue;
            const ClassModule = this.findNotifierClassModule(identifier);
            if (ClassModule === "") continue;
            const notificationServiceOptions = await this.findServiceOptions(identifier);
            if (!notificationServiceOptions) {
                console.log('Not a registered Notification service');
                continue;
            }
            console.log(notificationServiceOptions,'found options');
            
            const notificationHandler = new ClassModule(notificationServiceOptions, journal);
            notificationHandler.sendNotification();
            tracker++;
        }
        return {message: `notification sent successfully for ${tracker} transactions found`};

    }catch(err){
        console.log("notification not successful", err.message);
        return;
    }
        
    }

}

module.exports = AutoNotifications;