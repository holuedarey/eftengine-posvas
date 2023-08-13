require('dotenv').config();
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');
const moment = require('moment');

class WemaNotifier {
	constructor(notificationService, notificationData) {
		this.notificationService = notificationService;
		this.notificationData = notificationData;
	}

	async sendNotification() {
		console.log(
			'Sending Notification ::',
			JSON.stringify(this.notificationData)
		);

		const token = process.env.wema_token;

		let notificationUrl = this.notificationService.url;

		let theMTIClass = this.notificationData.MTI.substr(0, 2);

		if (theMTIClass == '04') {
			return false;
		}

		console.log(this.notificationData.responseCode, 'responseCode');

		if (this.notificationData.responseCode != '00') return;

		// console.log(`Notification Url :: ${notificationUrl}`);

		// console.log(`Notification Service :: ${this.notificationService}`);

		let requestBody = {
			transactionReference: this.notificationData.rrn,
			reference: this.notificationData.rrn,
			transactionType: this.notificationData.transactionType,
			transactionDate: moment(
				this.notificationData.transactionTime
			).format('YYYY-MM-DD HH:mm:ss'),
			responseCode: this.notificationData.responseCode,
			terminalId: this.notificationData.terminalId,
			pan: this.notificationData.maskedPan,
			amount: this.notificationData.amount / 100,
			cardExpiry: this.notificationData.cardExpiry ? 
			this.notificationData.cardExpiry : 
			this.notificationData.ejournalData && this.notificationData.ejournalData.expiry ? this.notificationData.ejournalData.expiry.replace('/', '') : "",
			// this.notificationData.cardExpiry || this.notificationData.ejournalData || this.notificationData.ejournalData !== null ? 
			// this.notificationData.cardExpiry || this.notificationData.ejournalData.expiry : 
			// 	this.notificationData.ejournalData.expiry !== undefined
			// 		? this.notificationData.ejournalData.expiry.replace('/', '')
			// 		: '',
			transactionFee: '',
			processingFee: '',
			retrievalReferenceNumber: this.notificationData.rrn,
			authCode: this.notificationData.authCode,
			merchantCode: this.notificationData.merchantId,
			stan: this.notificationData.STAN,
			merchantName: this.notificationData.merchantName,
			merchantDetails: {
				location: '',
				city: '',
				state: '',
				country: '',
			},
			echoData: this.notificationData.customerRef,
			callbackUrl: '',
			subscriptionReference: '86',
			reversal: false,
			ptsp: 'ITEX',
		};

		let notificationBody = JSON.stringify(requestBody);
		// console.log('notificationBody ::', notificationBody);

		let notificationHeaders = {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		};

		console.log(
			`Preparing to Send ::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`
		);

		Util.fileDataLogger(
			this.notificationData.terminalId,
			`Preparing to Send:::: out notification to ${this.notificationService.name}. Notification Body: ${notificationBody}`
		);

		// console.log('notificationUrl', notificationUrl);

		return fetch(notificationUrl, {
			method: 'POST',
			headers: notificationHeaders,
			body: notificationBody,
		})
			.then((response) => {
				// console.log('response: ', response);
				return response
					.text()
					.then((result) => {
						console.log(
							`Response from notification of ${
								this.notificationData._id
							} from ${
								this.notificationService.name
							}. Body: ${JSON.parse(result)}`
						);

						Journal.updateOne(
							{
								rrn: this.notificationData.rrn,
								customerRef: this.notificationData.customerRef,
								terminalId: this.notificationData.terminalId,
							},
							{ $set: { notified: JSON.stringify(result) } },
							(err, data) => {
								if (err)
									console.error(
										`error updating Wema notification result on journal at ${new Date().toString()} RRN : ${
											this.notificationData.rrn
										}`
									);
								else
									console.log(
										`Wema notification result updated successfully at ${new Date().toString()} RRN : ${
											this.notificationData.rrn
										}`
									);
							}
						);
						Util.fileDataLogger(
							this.notificationData.terminalId,
							`Response from notification of ${
								this.notificationData._id
							} from ${
								this.notificationService.name
							}. Body: ${JSON.stringify(result)}`
						);
					})

					.catch((err) => {
						Journal.updateOne(
							{
								rrn: this.notificationData.rrn,
								customerRef: this.notificationData.customerRef,
								terminalId: this.notificationData.terminalId,
							},
							{ $set: { notified: result.toString() } },
							(err, data) => {
								if (err)
									console.error(
										`error updating Wema notification result on journal at ${new Date().toString()} RRN : ${
											this.notificationData.rrn
										}`
									);
								else
									console.log(
										`Wema notification result updated successfully at ${new Date().toString()} RRN : ${
											this.notificationData.rrn
										}`
									);
							}
						);

						console.log(
							`There was an error processing the JSON response from ${
								this.notificationService.name
							} for ${
								this.notificationData._id
							}. Error: ${err}. The Response: ${result.toString()}`
						);
						Util.fileDataLogger(
							this.notificationData.terminalId,
							`There was an error processing the JSON response from ${
								this.notificationService.name
							} for of ${
								this.notificationData._id
							}. Error: ${err}. The Response: ${result.toString()}`
						);
						// return false;
					});
			})
			.catch((err) => {
				Journal.updateOne(
					{
						rrn: this.notificationData.rrn,
						customerRef: this.notificationData.customerRef,
					},
					{ $set: { notified: err.toString() } },
					(err, data) => {
						if (err)
							console.error(
								`error updating Wema notification result on journal at ${new Date().toString()} RRN : ${
									this.notificationData.rrn
								}`
							);
						else
							console.log(
								`Wema notification result updated successfully at ${new Date().toString()} RRN : ${
									this.notificationData.rrn
								}`
							);
					}
				);

				console.log(
					`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`
				);
				Util.fileDataLogger(
					this.notificationData.terminalId,
					`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`
				);
				// return false;
			});
	}
}

module.exports = WemaNotifier;
