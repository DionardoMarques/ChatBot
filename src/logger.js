const fs = require("fs");
const path = require("path");

function webhookLog(logMessage) {
	const logDir = path.join(__dirname, "logs");
	const logFile = path.join(logDir, "webhook.log");

	// Cria o diretório de logs se ele não existir
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir);
	}

	// Anexa a mensagem de log ao arquivo de log
	fs.appendFile(
		logFile,
		`${new Date().toISOString()} - ${logMessage}\n`,
		(err) => {
			if (err) {
				console.error("Error writing to log file:", err);
			}
		}
	);
}

function messageLog(logMessage) {
	const logDir = path.join(__dirname, "logs");
	const logFile = path.join(logDir, "message.log");

	// Cria o diretório de logs se ele não existir
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir);
	}

	// Anexa a mensagem de log ao arquivo de log
	fs.appendFile(
		logFile,
		`${new Date().toISOString()} - ${logMessage}\n`,
		(err) => {
			if (err) {
				console.error("Error writing to log file:", err);
			}
		}
	);
}

module.exports = { webhookLog, messageLog };
