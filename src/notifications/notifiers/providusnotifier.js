require('dotenv').config();
const moment = require('moment');
const fetch = require('node-fetch');
const Journal = require('../../model/journalmodel');
const Util = require('../../helpers/Util');

class ProvidusNotifier {
	constructor(notificationService, notificationData) {
		this.notificationService = notificationService;
		this.notificationData = notificationData;
	}

	async sendNotification() {
		const token = process.env.providus_token;
		console.log('token sent to PROVIDUS', token);

		let reversal = false;

		let notificationUrl = this.notificationService.url;
		let theMTIClass = this.notificationData.MTI.substr(0, 2);

		if (theMTIClass == '04' || this.notificationData.responseCode != '00') {
			reversal = true;
			return false;
		}

		// if (this.notificationData.responseCode != '00') return false;

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
				// this.notificationData.ejournalData ? this.notificationData.ejournalData.expiry ? this.notificationData.ejournalData.expiry.replace('/', '') : this.notificationData.cardExpiry : "",
				// this.notificationData.ejournalData || this.notificationData.ejournalData !== null
				// ? this.notificationData.ejournalData.expiry
				// : this.notificationData.ejournalData.expiry !== undefined
				// ? this.notificationData.ejournalData.expiry.replace('/', '')
				// : '',
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
				country: 'Nigeria',
			},
			echoData: this.notificationData.customerRef,
			callbackUrl: '',
			subscriptionReference: '',
			reversal: reversal,
			ptsp: 'ITEX',
		};

		let notificationBody = JSON.stringify(requestBody);

		let notificationHeaders = {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		};

		// console.log(`Preparing to Send ::: out notification to ${this.notificationService.name}. NOtification Url:: ${notificationUrl} Notification Body: ${notificationBody}`);

		Util.fileDataLogger(this.notificationData.terminalId, `Preparing to Send:::: out notification to ${this.notificationService.name}. NOtification Url:: ${notificationUrl} Notification Body: ${notificationBody}`);

		return fetch(notificationUrl, {
			method: 'POST',
			headers: notificationHeaders,
			body: notificationBody,
		})
			.then((response) => {
				// console.log('response', response.json());
				return response
			})
			.then((data) => {
				// console.log(`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
				Util.fileDataLogger(this.notificationData.terminalId, `Response from notification to ${this.notificationService.name}. NOtification Url:: ${notificationUrl} Notification Body: ${notificationBody}, ${JSON.stringify(data)}`);
				// console.log('Response oF NOTIFICATION...', JSON.stringify(data))
				if (data.status === 200) {
					Journal.updateOne({
							rrn: this.notificationData.rrn,
							terminalId: this.notificationData.terminalId,
						},
						{$set: { notified: JSON.stringify({ success: true })}
						},
						(err, data) => {
							if (err)
								console.error(`error updatiProvidus notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
							else
								console.log(`Providus notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
						});
					Util.fileDataLogger(this.notificationData.terminalId,`Response from notification of ${this.notificationData._id} from ${this.notificationService.name}. Body: ${JSON.stringify(data)}`);
				} else {
					throw new Error(`Status Message: ${data.statusText} Status: ${data.status} Bad Request...`);
				}
			})

			.catch((err) => {
				Journal.updateOne({rrn: this.notificationData.rrn, terminalId: this.notificationData.terminalId,},
					{ $set: { notified: response.toString() } },
					(err, data) => {
						if (err){
							console.error(`error ${err.message} updating Providus notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
							Util.fileDataLogger(this.notificationData.terminalId, `There was an error processing the JSON response from ${this.notificationService.name} for of ${this.notificationData._id}. Error: ${err}. The Response: ${response.toString()}`);
						}
						else{
							console.log(`Providus notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
						}
					});
				console.log(`There was an error processing the JSON response from ${this.notificationService.name} for ${this.notificationData._id}. Error: ${JSON.stringify(err)}. The Response: ${response.toString()}`);
				// return false;
			})
			.catch((err) => {
				Journal.updateOne(
					{
						rrn: this.notificationData.rrn,
						terminalId: this.notificationData.terminalId
					},
					{ $set: { notified: err.toString() } },
					(err, data) => {
						if (err)
							console.error(`error updating Providus notification result on journal at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
						else
							console.log(`Providus notification result updated successfully at ${new Date().toString()} RRN : ${this.notificationData.rrn}`);
					}
				);

				console.log(`There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
				Util.fileDataLogger(this.notificationData.terminalId, `There was an error sending notification of ${this.notificationData._id} to ${this.notificationService.name}. Error: ${err}`);
				// return false;
			});
	}
}

module.exports = ProvidusNotifier;
