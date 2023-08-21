"use strict";

const express = require("express");
const body_parser = require("body-parser");

const app = express().use(body_parser.json());

const { mainMessageProcess } = require("./functions/mainMessageProcess");
const { mainWebhookProcess } = require("./functions/mainWebhookProcess");

app.listen(process.env.PORT || 1337, () =>
	console.log("ChatBot TLSV está rodando")
);

// Envia mensagem (https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates#interactive)
app.get("/message", (req, res) => {
	mainMessageProcess(res);
});

// Notifica Eventos (https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications)
app.post("/webhook", (req, res) => {
	mainWebhookProcess(req, res);
});

// Valida Webhook (https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests)
app.get("/webhook", (req, res) => {
	const verify_token = "TLSV";

	let mode = req.query["hub.mode"];
	let token = req.query["hub.verify_token"];
	let challenge = req.query["hub.challenge"];

	if (mode && token) {
		if (mode === "subscribe" && token === verify_token) {
			console.log("WEBHOOK_VERIFIED");
			res.status(200).send(challenge);
		} else {
			res.sendStatus(403);
		}
	}
});
