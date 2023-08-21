const axios = require("axios");
const { messageLog } = require("./logger");
const { insertSendedMessage } = require("./queries/insertSendedMessage");

async function sendConfirmaVisita(
	designator,
	pon,
	token,
	sender_phone,
	customer_phone,
	display_schedule_date,
	formated_schedule_date,
	shift,
	service_type
) {
	// Requisição WA Cloud API (POST) - Template confirma_visita
	axios({
		method: "POST",
		url: `https://graph.facebook.com/v17.0/${sender_phone}/messages`,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		data: {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to: `${customer_phone}`,
			type: "template",
			template: {
				name: "confirma_visita",
				language: {
					code: "pt_BR",
				},
				components: [
					{
						type: "body",
						parameters: [
							{
								type: "text",
								text: `${display_schedule_date}`,
							},
							{
								type: "text",
								text: `${shift}`,
							},
						],
					},
				],
			},
		},
	})
		.then((response) => {
			var res_status = "Response status:" + response.status;
			var res_data = "Response data:" + JSON.stringify(response.data, null, 2);
			var log_message = "sendConfirmaVisita \n" + res_status + "\n" + res_data;

			var whatsapp_id = response.data.messages[0].id;
			var contacted_phone = response.data.contacts[0].wa_id;

			// Insert na CADWHATS
			insertSendedMessage(
				designator,
				pon,
				formated_schedule_date,
				whatsapp_id,
				shift,
				contacted_phone,
				service_type
			);

			// Inserindo log no sv
			messageLog(log_message);
			console.log("Mensagem enviada!");
		})
		.catch((error) => {
			if (error.response) {
				var err_status = "Error status:" + error.response.status;
				var err_data =
					"Error data:" + JSON.stringify(error.response.data, null, 2);
				var log_message =
					"sendConfirmaVisita \n" + err_status + "\n" + err_data;

				messageLog(log_message);

				console.log(err_status);
				console.log(err_data);
			} else {
				var err = "Error:" + error.message;
				var log_message = "sendConfirmaVisita \n" + err;

				messageLog(log_message);

				console.log(err);
			}
		});
}

async function sendMessageTest(
	designator,
	pon,
	token,
	sender_phone_id,
	customer_phone,
	formated_schedule_date,
	shift,
	service_type
) {
	axios({
		method: "POST",
		url:
			"https://graph.facebook.com/v17.0/" +
			sender_phone_id +
			"/messages?access_token=" +
			token,
		data: {
			messaging_product: "whatsapp",
			to: customer_phone,
			text: { body: "Olá, esta é uma mensagem de teste!" },
		},
		headers: { "Content-Type": "application/json" },
	})
		.then((response) => {
			var res_status = "Response status:" + response.status;
			var res_data = "Response data:" + JSON.stringify(response.data, null, 2);
			var log_message = "sendMessageTest \n" + res_status + "\n" + res_data;

			var whatsapp_id = response.data.messages[0].id;
			var contacted_phone = response.data.contacts[0].wa_id;

			// Insert na CADWHATS
			insertSendedMessage(
				designator,
				pon,
				formated_schedule_date,
				whatsapp_id,
				shift,
				contacted_phone,
				service_type
			);

			// Inserindo log no sv
			messageLog(log_message);
			console.log("Mensagem enviada!");
		})
		.catch((error) => {
			if (error.response) {
				var err_status = "Error status:" + error.response.status;
				var err_data =
					"Error data:" + JSON.stringify(error.response.data, null, 2);
				var log_message = "sendMessageTest \n" + err_status + "\n" + err_data;

				messageLog(log_message);

				console.log(err_status);
				console.log(err_data);
			} else {
				var err = "Error:" + error.message;
				var log_message = "sendMessageTest \n" + err;

				messageLog(log_message);

				console.log(err);
			}
		});
}

module.exports = { sendConfirmaVisita, sendMessageTest };
