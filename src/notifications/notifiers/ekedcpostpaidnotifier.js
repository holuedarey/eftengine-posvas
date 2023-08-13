require("dotenv").config();
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class EkedcNotifier {
	constructor(notificationService, notificationData) {
		this.notificationService = notificationService;
		this.notificationData = notificationData;
	}

	async sendNotification() {
		console.log(
			'Sending Notification EKEDC ::',
			JSON.stringify(this.notificationData)
		);

		let notificationUrl = this.notificationService.url;

		// let reversal = false;

		let theMTIClass = this.notificationData.MTI.substr(0, 2);

		if (theMTIClass == '04') {
			return false;
		}

		console.log(this.notificationData.responseCode, 'responseCode');

		if (this.notificationData.responseCode !== '00') return;

		console.log(`Notification Url :: ${notificationUrl}`);

		let customRef = this.notificationData.customerRef;
		// console.log(customRef, 'customRef');
		let storage = customRef.split('|');
        let requestBody = {
			amount: this.notificationData.amount / 100,
			currency: "NGN",
			meterNo: storage[1],
			reference: storage[2],
			payment: {
				status: this.notificationData.responseCode ? 'Approved' : 'Failed',
				rrn: this.notificationData.rrn,
				pan: this.notificationData.maskedPan,
				stan: this.notificationData.STAN,
				timestamp: this.notificationData.transactionTime,
				merchantID: this.notificationData.merchantID,
				merchantName: this.notificationData.merchantName,
			}
		}

		let notificationBody = JSON.stringify(requestBody);
		console.log('notificationBody ::', notificationBody);

		let notificationHeaders = {
			'Content-Type': 'application/json',
			env: process.env.EKEDC_ENV === 'false' ? 'TEST': 'LIVE',
			'apiKey': process.env.EKEDC_API_KEY,
			tid: this.notificationData.terminalId,
		};
		// notificationHeaders['api-key'] = apiKey;

		console.log(`Preparing to Send ::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`);

		Util.fileDataLogger(this.notificationData.terminalId,
			`Preparing to Send:::: out notification to ${this.notificationService.name}. Notification Headers::: ${JSON.stringify(notificationHeaders)} Notification Body: ${notificationBody}`);

		console.log('notificationUrl', notificationUrl);

		return fetch(notificationUrl, {
			method: 'POST',
			headers: notificationHeaders,
			body: notificationBody,
		})
			.then((response) => {
				console.log('response: ', response);
				return response
					.text()
					.then(result => {
						console.log(`Response from notification of ${ this.notificationData._id } from ${this.notificationService.name}. Body: ${JSON.parse(result)}`);

						Journal.updateOne(
							{
								rrn: this.notificationData.rrn,
								terminalId: this.notificationData.terminalId,
							},
							{ $set: { notified: JSON.stringify(result) } },
							(err, data) => {
								if (err)
									console.error(`error updating EkedcPostPaid notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
								else
									console.log(`EkedcPostPaid notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
							}
						);
						Util.fileDataLogger(this.notificationData.terminalId, `Response from notification of ${this.notificationData._id } from ${this.notificationService.name}. Body: ${JSON.stringify(result)}`);
					})

					.catch((err) => {
						Journal.updateOne(
							{
								rrn: this.notificationData.rrn,
								terminalId: this.notificationData.terminalId,
							},
							{ $set: { notified: result.toString() } },
							(err, data) => {
								if (err)
									console.error(`error updating EkedcPostPaid notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
								else
									console.log(`EkedcPostPaid notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
							}
						);

						console.log(`There was an error processing the JSON response from ${this.notificationService.name} for ${this.notificationData._id}. Error: ${err}. The Response: ${result.toString()}`);
						Util.fileDataLogger(this.notificationData.terminalId,
							`There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${result.toString()}`);
						// return false;
					});
			})
			.catch((err) => {
				Journal.updateOne(
					{
						rrn: this.notificationData.rrn,
						terminalId: this.notificationData.terminalId,
					},
					{ $set: { notified: err.toString() } },
					(err, data) => {
						if (err)
							console.error(`error updating EkedcPostPaid notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
						else
							console.log(`EkedcPostPaid notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
					}
				);

				console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
				Util.fileDataLogger(this.notificationData.terminalId,`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
				// return false;
			});
	}
}

module.exports = EkedcNotifier;
