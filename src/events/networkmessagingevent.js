const EventEmitter = require('events');

const CallhomeNotifier = require('../notifications/notifiers/callhomenotifier');

const NetworkUtil = require('../helpers/NetworkUtil');

class NetworkMessagingEvent extends EventEmitter {

    constructor(){

        super();

        this.on('complete', () => {

            console.log(`New Network Message Processed`);

            //Handle Other processes and notifications

        });

        this.on('callhome',(data)=>{
            let callhomeNotifier = new CallhomeNotifier(data);
            callhomeNotifier.sendNotification();
            

            NetworkUtil.sendStanbicTermNotification(data);
            NetworkUtil.sendGtbTermNotification(data);
        });

    }

}

module.exports = NetworkMessagingEvent;