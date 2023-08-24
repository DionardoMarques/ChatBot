const { promisify } = require("util");
const { Firebird, options } = require("../conn");

const attachAsync = promisify(Firebird.attach);
const axios = require("axios");
require("dotenv/config");

const { webhookLog, messageLog } = require("../logger");
const { processWebhookResponse } = require("../queries/processWebhookResponse");
const {
	insertInteractiveMessageStatus,
} = require("../queries/insertInteractiveMessageStatus");

async function mainWebhookProcess(req, res) {
	const conn = await attachAsync(options);

	try {
		// Conteúdo do payload enviado pela API do WPP
		const body = req.body;

		const webhook_log_message = JSON.stringify(body, null, 2);
		webhookLog(webhook_log_message);

		const token = process.env.TOKEN;
		const sender_phone = process.env.SENDER_PHONE;

		// Retornos JSON WA Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages)
		if (body.object) {
			// Status das mensagens enviadas e recebidas pelo webhook
			if (
				body.entry &&
				body.entry[0].changes &&
				body.entry[0].changes[0] &&
				body.entry[0].changes[0].value &&
				body.entry[0].changes[0].value.statuses &&
				body.entry[0].changes[0].value.statuses[0]
			) {
				let message_status = body.entry[0].changes[0].value.statuses[0].status;
				const whatsapp_id = body.entry[0].changes[0].value.statuses[0].id;
				const contact_verified =
					body.entry[0].changes[0].value.statuses[0].recipient_id;

				console.log("Status da mensagem: " + message_status);
				console.log("ID requisição WPP: " + whatsapp_id);
				console.log("Telefone cliente: " + contact_verified);

				// Possíveis errors retornados do webhook
				let error_code, error_message, error_details;

				if (
					body.entry[0].changes[0].value.statuses[0].errors &&
					body.entry[0].changes[0].value.statuses[0].errors[0] &&
					body.entry[0].changes[0].value.statuses[0].errors[0].code &&
					body.entry[0].changes[0].value.statuses[0].errors[0].message &&
					body.entry[0].changes[0].value.statuses[0].errors[0].error_data &&
					body.entry[0].changes[0].value.statuses[0].errors[0].error_data
						.details
				) {
					error_code =
						body.entry[0].changes[0].value.statuses[0].errors[0].code;
					error_message =
						body.entry[0].changes[0].value.statuses[0].errors[0].message;
					error_details =
						body.entry[0].changes[0].value.statuses[0].errors[0].error_data
							.details;
				}

				// Atualizando o status da mensagem e o CONTATO_OK com parâmetros adicionais de erro
				if (error_code && error_message && error_details) {
					await processWebhookResponse(
						conn,
						message_status,
						whatsapp_id,
						contact_verified,
						error_code,
						error_message,
						error_details,
						token,
						sender_phone
					);
				}

				// Atualizando o status da mensagem e o CONTATO_OK
				else {
					await processWebhookResponse(
						conn,
						message_status,
						whatsapp_id,
						contact_verified
					);
				}
			}
			// Conteúdo das mensagens sem status
			else {
				console.log("Nova mensagem recebida!");
			}

			// Conteúdo das mensagens enviadas e recebidas pelo webhook
			if (
				body.entry &&
				body.entry[0].changes &&
				body.entry[0].changes[0] &&
				body.entry[0].changes[0].value &&
				body.entry[0].changes[0].value.messages &&
				body.entry[0].changes[0].value.messages[0]
			) {
				// Conteúdo das mensagens enviadas
				const sender_phone_id =
					body.entry[0].changes[0].value.metadata.phone_number_id;

				let whatsapp_id;

				if (body.entry[0].changes[0].value.messages[0].context) {
					whatsapp_id = body.entry[0].changes[0].value.messages[0].context.id;
				}

				const customer_phone = body.entry[0].changes[0].value.messages[0].from;

				if (body.entry[0].changes[0].value.messages[0].button) {
					let reply_button =
						body.entry[0].changes[0].value.messages[0].button.payload;

					console.log("Payload com interação!");

					// Insert na CADBACKLA2 ou CADBACKACE2
					await insertInteractiveMessageStatus(conn, whatsapp_id, reply_button);

					// Mensagem resposta para o cliente após interação com a mensagem (botão Confirma ou Não Confirma)
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
							text: { body: "Muito obrigada, a TLSV agradece sua atenção!" },
						},
						headers: { "Content-Type": "application/json" },
					})
						.then((response) => {
							const res_status = "Response status:" + response.status;
							const res_data =
								"Response data:" + JSON.stringify(response.data, null, 2);
							const log_message =
								"Mensagem resposta interacao \n" + res_status + "\n" + res_data;

							messageLog(log_message);

							console.log("Mensagem resposta enviada!");
						})
						.catch((error) => {
							if (error.response) {
								const err_status = "Error status:" + error.response.status;
								const err_data =
									"Error data:" + JSON.stringify(error.response.data, null, 2);
								const log_message =
									"Mensagem resposta interacao \n" +
									err_status +
									"\n" +
									err_data;

								messageLog(log_message);

								console.log(err_status);
								console.log(err_data);
							} else {
								const err = "Error:" + error.message;
								const log_message = "Mensagem resposta interacao \n" + err;

								messageLog(log_message);

								console.log(err);
							}
						});
				}
				// Mensagem padrão para qualquer caso que não seja a interação do cliente (template confirma_visita)
				else {
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
							text: {
								body: "Olá! A TLSV agradece o seu contato, no momento não há interações possíveis para este tipo de mensagem.",
							},
						},
						headers: { "Content-Type": "application/json" },
					})
						.then((response) => {
							const res_status = "Response status:" + response.status;
							const res_data =
								"Response data:" + JSON.stringify(response.data, null, 2);
							const log_message =
								"Mensagem resposta padrao \n" + res_status + "\n" + res_data;

							messageLog(log_message);

							console.log("Mensagem resposta enviada!");
						})
						.catch((error) => {
							if (error.response) {
								const err_status = "Error status:" + error.response.status;
								const err_data =
									"Error data:" + JSON.stringify(error.response.data, null, 2);
								const log_message =
									"Mensagem resposta padrao \n" + err_status + "\n" + err_data;

								messageLog(log_message);

								console.log(err_status);
								console.log(err_data);
							} else {
								const err = "Error:" + error.message;
								const log_message = "Mensagem resposta padrao \n" + err;

								messageLog(log_message);

								console.log(err);
							}
						});
				}
			}
			res.sendStatus(200);
		} else {
			res.sendStatus(404);
		}
	} catch (error) {
		console.log(error);
		throw error;
	} finally {
		conn.detach();
	}
}

module.exports = { mainWebhookProcess };
