const { promisify } = require("util");
const { Firebird, options } = require("../conn");

const attachAsync = promisify(Firebird.attach);

async function noValidContact(
	designator,
	pon,
	formated_schedule_date,
	shift,
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
                                             '', 
                                             CAST(? AS VARCHAR(20) CHARACTER SET WIN1252), 
                                             '', 
                                             'CONTATO WHATSAPP - SEM CONTATO',
                                             ?)`;
		const query_params = [
			designator,
			pon,
			formated_schedule_date,
			shift,
			service_type,
		];

		const queryAsync = promisify(conn.query);
		await queryAsync.call(conn, query, query_params);
		console.log("Nenhum contato válido! Insert realizado com sucesso!");

		conn.detach();
	} catch (error) {
		console.log(error);
		throw error;
	}
}

module.exports = { noValidContact };
