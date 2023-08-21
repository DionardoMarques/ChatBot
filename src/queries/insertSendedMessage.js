const { promisify } = require("util");
const { Firebird, options } = require("../conn");

const attachAsync = promisify(Firebird.attach);

async function insertSendedMessage(
	designator,
	pon,
	formated_schedule_date,
	whatsapp_id,
	shift,
	contacted_phone,
	service_type
) {
	try {
		const conn = await attachAsync(options);

		const query = `INSERT INTO CADWHATS (NUMERO, 
                                             DESIGNADOR, 
                                             PON, 
                                             DATA_AGENDA, 
                                             DATA, 
                                             ID_WHATSAPP, 
                                             MONITORAMENTO, 
                                             CONTATO_ENVIO, 
                                             SITUACAO_ENVIO, 
                                             TIPO_SERVICO) 
									  VALUES(gen_Id(GEN_WHATS,1), 
											 ?, 
											 ?, 
											 ?,
											 CURRENT_TIMESTAMP, 
											 ?, 
											 CAST(? AS VARCHAR(20) CHARACTER SET WIN1252), 
											 ?,
											 'PRIMEIRO ENVIO', 
											 ?)`;
		const query_params = [
			designator,
			pon,
			formated_schedule_date,
			whatsapp_id,
			shift,
			contacted_phone,
			service_type,
		];

		const queryAsync = promisify(conn.query);
		await queryAsync.call(conn, query, query_params);
		console.log("Insert realizado com sucesso na CADWHATS!");

		conn.detach();
	} catch (error) {
		console.log(error);
		throw error;
	}
}

module.exports = { insertSendedMessage };
