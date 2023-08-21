"use strict";

const express = require("express");
const body_parser = require("body-parser");
const axios = require("axios");

const app = express().use(body_parser.json());

const { mainMessageProcess } = require("./functions/mainMessageProcess");

app.listen(process.env.PORT || 1337, () =>
	console.log("ChatBot TLSV está rodando")
);

// Envia mensagem (https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates#interactive)
app.get("/message", (req, res) => {
	mainMessageProcess(res);
});
