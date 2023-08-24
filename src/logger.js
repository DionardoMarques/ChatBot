const fs = require("fs");
const path = require("path");

function getBrazilianTime() {
	const options = {
		timeZone: "America/Sao_Paulo",
		hour12: false, // Use 24-hour format
	};
	return new Date().toLocaleString("pt-BR", options);
}

function webhookLog(logMessage) {
	const logDir = path.join(__dirname, "logs");
	const logFile = path.join(logDir, "webhook.log");

	// Cria o diretório de logs se ele não existir
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir);
	}

	// Anexa a mensagem de log ao arquivo de log
	fs.appendFile(logFile, `${getBrazilianTime()} - ${logMessage}\n`, (err) => {
		if (err) {
			console.error("Error writing to log file:", err);
		}
	});
}

function messageLog(logMessage) {
	const logDir = path.join(__dirname, "logs");
	const logFile = path.join(logDir, "message.log");

	// Cria o diretório de logs se ele não existir
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir);
	}

	// Anexa a mensagem de log ao arquivo de log
	fs.appendFile(logFile, `${getBrazilianTime()} - ${logMessage}\n`, (err) => {
		if (err) {
			console.error("Error writing to log file:", err);
		}
	});
}

module.exports = { webhookLog, messageLog };
