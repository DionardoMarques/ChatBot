const { promisify } = require("util");
const { Firebird, options } = require("../conn");

const attachAsync = promisify(Firebird.attach);

const { sendConfirmaVisita, sendMessageTest } = require("../message");

async function processWebhookResponse(
	message_status,
	whatsapp_id,
	contact_verified,
	error_code = null,
	error_message = null,
	error_details = null,
	token,
	sender_phone
) {
	try {
		const conn = await attachAsync(options);

		const query = `SELECT DESIGNADOR,
                              PON,
                              TIPO_SERVICO,
                              DATA_AGENDA,
                              ID_WHATSAPP,
                              CAST(MONITORAMENTO AS VARCHAR(20) CHARACTER SET WIN1252) AS MONITORAMENTO
                       FROM CADWHATS
                       WHERE ID_WHATSAPP = ?`;
		const query_params = [whatsapp_id];

		const queryAsync = promisify(conn.query);
		const result = await queryAsync.call(conn, query, query_params);

		conn.detach();
	} catch (error) {
		console.log(error);
		throw error;
	}
}

module.exports = { processWebhookResponse };
