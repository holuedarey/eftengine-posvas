require("dotenv").config();
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class BedcCcodNotifier {
	constructor(notificationService, notificationData) {
		this.notificationService = notificationService;
		this.notificationData = notificationData;
	}

	async sendNotification() {
		console.log(
			'Sending Notification BEDC CCOD ::',
			JSON.stringify(this.notificationData)
		);

		const apiKey = this.notificationService.api_key;
		console.log('apikey', apiKey);

		let notificationUrl = this.notificationService.url;

		let reversal = false;

		let theMTIClass = this.notificationData.MTI.substr(0, 2);

		if (theMTIClass == '04') {
			return false;
		}

		console.log(this.notificationData.responseCode, 'responseCode');

		if (this.notificationData.responseCode !== '00') return false;

		console.log(`Notification Url :: ${notificationUrl}`);

		console.log(`Notification Service :: ${this.notificationService}`);
		// let customRef = this.notificationData.customerRef;
		
		let passedData = this.notificationData.customerRef.split('~');
		console.log(passedData, 'passedData after splitting');

		let requestBody = {
			accountNumber: passedData[1],
			amount: (this.notificationData.amount / 100).toString(),
			merchantId: this.notificationData.merchantId,
			phoneNumber: passedData[2],
			authCode:this.notificationData.authCode,
			retrievalNumber: this.notificationData.rrn,
			agentPhoneNumber: passedData[3],
			maskedPan: this.notificationData.maskedPan,
			terminalId: this.notificationData.terminalId,
			accountType: "OFFLINE_POSTPAID",
			validation_id: passedData[4],
			channel: "pos",
			service: "bedc",
		}

		let notificationBody = JSON.stringify(requestBody);
		// console.log('notificationBody ::', notificationBody);

		let notificationHeaders = {
			'Content-Type': 'application/json',
			'validation-access-token': 'itex_validation',
		};

		console.log(`Preparing to Send ::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

		Util.fileDataLogger(this.notificationData.terminalId,
			`Preparing to Send:::: out notification to ${this.notificationService.name}. Notification Headers::: ${JSON.stringify(notificationHeaders)} Notification Body: ${notificationBody} `);

		console.log('notificationUrl', notificationUrl);

		return fetch(notificationUrl, {
			method: 'POST',
			headers: notificationHeaders,
			body: notificationBody,
		})
		.then((response) => {
			response.json()
			.then((data) => {
				console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
				Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);

				Journal.updateOne({ _id : this.notificationData._id, rrn: this.notificationData.rrn, terminalId: this.notificationData.terminalId },
					{ $set: { notified: JSON.stringify(data) } },
					(err, data) => {
						if (err)
							console.error(`error updating BEDC CCOD notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
						else
							console.log(`BEDC CCOD notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
					}
				);

				// Journal.updateOne({_id : this.notificationData._id},{$set : {notified : JSON.stringify(data)}},(err,data)=>{
				// 	if(err)
				// 		console.error(`error updating C24 notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
				// 	else
				// 	console.log(`C24 notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
				// });
			})
			.catch((err) => {
				Journal.updateOne({ rrn: this.notificationData.rrn, terminalId: this.notificationData.terminalId },
					{ $set: { notified: result.toString() } },
					(err, data) => {
						if (err)
							console.error(`error updating EkedcPostPaid notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
						else
							console.log(`EkedcPostPaid notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
				});

				console.log(`There was an error processing the JSON response from ${this.notificationService.name} for ${this.notificationData._id}. Error: ${err}. The Response: ${data.toString()}`);
				Util.fileDataLogger(this.notificationData.terminalId, `There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${data.toString()}`);
			});
		})
		.catch((err) => {
			Journal.updateOne({ rrn: this.notificationData.rrn, terminalId: this.notificationData.terminalId },
				{ $set: { notified: err.toString() } },
				(err, data) => {
					if (err)
						console.error(`error updating EkedcPostPaid notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
					else
						console.log(`EkedcPostPaid notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
				});

			console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
			Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
		});
	}
}

module.exports = BedcCcodNotifier;
