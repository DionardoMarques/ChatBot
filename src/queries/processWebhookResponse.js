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

		// Buscando os dados da mensagem na CADWHATS baseado no ID_WHATSAPP
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

		// Se o ID_WHATSAPP existir será atualizado o status da mensagem
		if (result.length != 0) {
			const designator = result[0].DESIGNADOR;
			const pon = result[0].PON;
			const service_type = result[0].TIPO_SERVICO;
			const whatsapp_id = result[0].ID_WHATSAPP;
			const shift = result[0].MONITORAMENTO;
			const schedule_date = result[0].DATA_AGENDA;

			// Formatando a DATA_AGENDA para 'MM/DD/AAAA'
			const date = new Date(schedule_date);
			const month = String(date.getMonth() + 1).padStart(2, "0"); // Mês inicia em 0
			const day = String(date.getDate()).padStart(2, "0");
			const year = date.getFullYear();
			const formated_schedule_date = month + "/" + day + "/" + year;

			// Formatando a DATA_AGENDA para 'MM/DD/AAAA' + 1 = DATA_VENCIMENTO
			const date_ = new Date(schedule_date);
			date_.setDate(date_.getDate() + 1);
			const month_ = String(date_.getMonth() + 1).padStart(2, "0"); // Mês inicia em 0
			const day_ = String(date_.getDate()).padStart(2, "0");
			const year_ = date_.getFullYear();
			const formated_expire_date = month_ + "/" + day_ + "/" + year_;

			// Mensagem com erro retornada pelo webhook ao tentar enviar para o cliente
			if (message_status == "failed") {
				message_status = "CONTATO WHATSAPP - CONTATO INVÁLIDO";

				// Atualizando os status das mensagens conforme retorno do webhook
				const query = `UPDATE CADWHATS
                               SET SITUACAO_ENVIO = CAST(? AS VARCHAR(50) CHARACTER SET WIN1252)
                               WHERE ID_WHATSAPP = ?`;
				const query_params = [message_status, whatsapp_id];
				const queryAsync = promisify(conn.query);
				await queryAsync.call(conn, query, query_params);
				console.log("Status da mensagem atualizado com sucesso!");

				// Verificando se as variáveis de erro estão setadas
				if (
					error_code !== null &&
					error_message !== null &&
					error_details !== null
				) {
					console.log("Código de erro:", error_code);
					console.log("Mensagem de erro:", error_message);
					console.log("Detalhes do erro:", error_details);

					// Verificando se o erro é o 131026 - WPP inválido (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes#other-errors)
					if (
						error_code == 131026 &&
						error_message ==
							"Receiver is incapable of receiving this message" &&
						error_details == "Message Undeliverable."
					) {
						console.log(
							"O número de telefone do destinatário não é um número de telefone do WhatsApp válido."
						);

						// Buscando todos os contatos utilizados para o primeiro envio da mensagem
						const query = `SELECT CONTATO_ENVIO
                                       FROM CADWHATS
                                       WHERE DESIGNADOR = ?`;
						const query_params = [designator];
						const queryAsync = promisify(conn.query);
						const result = await queryAsync.call(conn, query, query_params);

						const contacts_used = []; // Telefones cadastrados na CADWHATS

						result.forEach(function (row) {
							contacts_used.push(row.CONTATO_ENVIO);
						});

						console.log("Telefones Utilizados:", contacts_used);

						// Buscando outros contatos do cliente para tentativa de reenvio
						const query2 = `SELECT CONTATO_OK,
                                               CONTATO,
                                               CONTATO2,
                                               CONTATO3
                                        FROM CADCONTATO
                                        WHERE DESIGNADOR = ?`;
						const query_params2 = [designator];
						const queryAsync2 = promisify(conn.query);
						const result2 = await queryAsync2.call(conn, query2, query_params2);

						const contacts_recorded = []; // Telefones cadastrados na CADCONTATO

						result2.forEach(function (row) {
							// Formatando os telefones (Removendo +55 se existir)
							if (
								row.CONTATO_OK !== "" &&
								row.CONTATO_OK !== null &&
								row.CONTATO_OK !== "Nao encontrado"
							) {
								const contact_ok = row.CONTATO_OK.replace("+55", "");
								contacts_recorded.push(contact_ok);
							}

							if (
								row.CONTATO !== "" &&
								row.CONTATO !== null &&
								row.CONTATO !== "Nao encontrado"
							) {
								const contact = row.CONTATO.replace("+55", "");
								contacts_recorded.push(contact);
							}

							if (
								row.CONTATO2 !== "" &&
								row.CONTATO2 !== null &&
								row.CONTATO2 !== "Nao encontrado"
							) {
								const contact2 = row.CONTATO2.replace("+55", "");
								contacts_recorded.push(contact2);
							}

							if (
								row.CONTATO3 !== "" &&
								row.CONTATO3 !== null &&
								row.CONTATO3 !== "Nao encontrado"
							) {
								const contact3 = row.CONTATO3.replace("+55", "");
								contacts_recorded.push(contact3);
							}
						});

						console.log("Telefones Registrados:", contacts_recorded);

						// Procura contatos que estão na CADCONTATO, porém não estão na CADWHATS
						let not_used_contacts = contacts_recorded.filter(function (
							contact
						) {
							return !contacts_used.some((usedContact) =>
								usedContact.endsWith(contact.substr(-8))
							);
						});

						// Adicionado o prefixo "+55" para cada telefone do array not_used_contacts
						not_used_contacts = not_used_contacts.map(
							(contact) => "+55" + contact
						);

						// Reenviando a mensagem para outro telefone ainda não utilizado
						if (not_used_contacts.length != 0) {
							console.log("Contatos não utilizados:", not_used_contacts);

							// Template (gera custo)
							// sendConfirmaVisita(
							// 	designator,
							// 	pon,
							// 	token,
							// 	sender_phone,
							// 	not_used_contacts[0],
							// 	display_schedule_date,
							// 	formated_schedule_date,
							// 	shift,
							// 	service_type
							// );

							// Teste mensagem livre (sem template/sem cobrança)
							sendMessageTest(
								designator,
								pon,
								token,
								sender_phone,
								not_used_contacts[0],
								formated_schedule_date,
								shift,
								service_type
							);
						} else {
							console.log(
								"Não existem contatos para reenviar a mensagem via WPP."
							);

							const query = `UPDATE CADCONTATO
                                           SET ATUALIZACAO = null
                                           WHERE DESIGNADOR = ?`;
							const query_params = [designator];
							const queryAsync = promisify(conn.query);
							await queryAsync.call(conn, query, query_params);

							console.log(
								"Coluna ATUALIZACAO na CADCONTATO setada para vazio!"
							);

							await insertTreatments(
								service_type,
								schedule_date,
								formated_schedule_date,
								formated_expire_date,
								pon,
								message_status,
								whatsapp_id
							);
						}
					}
				}
			}
			// Mensagens que não geraram erro ao serem enviadas para o cliente
			else {
				// Buscando todos os contatos do cliente
				const query = `SELECT CONTATO_OK,
                                      CONTATO,
                                      CONTATO2,
                                      CONTATO3
                               FROM CADCONTATO
                               WHERE DESIGNADOR = ?`;
				const query_params = [designator];
				const queryAsync = promisify(conn.query);
				const result = await queryAsync.call(conn, query, query_params);

				const contato_ok = result[0].CONTATO_OK;
				const contact = result[0].CONTATO;
				const contact2 = result[0].CONTATO2;
				const contact3 = result[0].CONTATO3;

				let contact_update;

				// Verificando qual foi o contato utilizado da CADCONTATO
				if (contact_verified.endsWith(contact.substr(-8))) {
					contact_update = contact;
				} else if (contact_verified.endsWith(contact2.substr(-8))) {
					contact_update = contact2;
				} else if (contact_verified.endsWith(contact3.substr(-8))) {
					contact_update = contact3;
				} else {
					contact_update = contact_verified;
				}

				// Atualizando CONTATO_OK na CADCONTATO apenas quando o webhook retornar SENT
				if (message_status == "sent") {
					message_status = "CONTATO WHATSAPP - ENVIADO";

					// Apenas atualizará o CONTATO_OK se não houver nada cadastrado
					if (contato_ok == "" || contato_ok == null) {
						const query = `UPDATE CADCONTATO
                                       SET CONTATO_OK = ?
                                       WHERE DESIGNADOR = ?`;
						const query_params = [contact_update, designator];
						const queryAsync = promisify(conn.query);
						await queryAsync.call(conn, query, query_params);

						console.log("Update na CADCONTATO com o telefone OK!");
					} else {
						console.log("Já existe outro CONTATO_OK cadastrado!");
					}
				} else if (message_status == "delivered") {
					message_status = "CONTATO WHATSAPP - ENTREGUE";
				} else if (message_status == "read") {
					message_status = "CONTATO WHATSAPP - LIDO";
				} else {
					message_status = message_status;
				}

				// Atualizando os status das mensagens conforme retorno do webhook
				const query2 = `UPDATE CADWHATS
                                SET SITUACAO_ENVIO = CAST(? AS VARCHAR(50) CHARACTER SET WIN1252)
                                WHERE ID_WHATSAPP = ?`;
				const query_params2 = [message_status, whatsapp_id];
				const queryAsync2 = promisify(conn.query);
				await queryAsync2.call(conn, query2, query_params2);

				console.log("Status da mensagem atualizado com sucesso!");

				await insertTreatments(
					service_type,
					schedule_date,
					formated_schedule_date,
					formated_expire_date,
					pon,
					message_status,
					whatsapp_id
				);
			}
		} else {
			console.log("ID_WHATSAPP não existe na tabela CADWHATS!");
		}

		conn.detach();
	} catch (error) {
		console.log(error);
		throw error;
	}
}

async function insertTreatments(
	service_type,
	schedule_date,
	formated_schedule_date,
	formated_expire_date,
	pon,
	message_status,
	whatsapp_id
) {
	try {
		console.log(service_type);

		const conn = await attachAsync(options);

		// Insert tratativas CADBACKLA2
		if (service_type == "BA") {
			console.log("Data agenda formatada:", formated_schedule_date);

			// Select para o insert dos dados necessários na CADBACKLA2
			const query = `SELECT DISTINCT
                                CAST(CADBACKLOG.INSTANCIA AS VARCHAR(25) CHARACTER SET WIN1252) AS DESIGNADOR,
                                CADCONTATO.CONTATO_OK,
                                CADCONTATO.CONTATO,
                                CADCONTATO.CONTATO2,
                                CADCONTATO.CONTATO3,
                                COALESCE(MAX(CADBACKLA2.SEQUENCIA),0) AS SEQUENCIA,
                                CADBACKLOG.BA,
                                CAST(CADBACKLOG.CIDADE AS VARCHAR(150) CHARACTER SET WIN1252) AS CIDADE,
                                CAST(CADBACKLOG.CLUSTER AS VARCHAR(30) CHARACTER SET WIN1252) AS CLUSTER,
                                CAST(CADBACKLOG.ARMARIO AS VARCHAR(20) CHARACTER SET WIN1252) AS ARMARIO,
                                CAST(CADBACKLOG.CLIENTE AS VARCHAR(255) CHARACTER SET WIN1252) AS CLIENTE,
                                CAST(CADBACKLOG.LOGRADOURO AS VARCHAR(255) CHARACTER SET WIN1252) AS LOGRADOURO,
                                CAST(CADBACKLOG.TECNOLOGIA AS VARCHAR(30) CHARACTER SET WIN1252) AS TECNOLOGIA,
                                CADBACKLOG.ABERTURA,
                                CAST(CADBACKLOG.SERVICO AS VARCHAR(15) CHARACTER SET WIN1252) AS SERVICO,
                                CAST(CADBACKLOG.STATUS AS VARCHAR(150) CHARACTER SET WIN1252) AS STATUS,
                                CAST(CADBACKLOG.MOTIVO AS VARCHAR(200) CHARACTER SET WIN1252) AS MOTIVO,
                                CAST(CADBACKLOG.STATUS_BA AS VARCHAR(20) CHARACTER SET WIN1252) AS STATUS_BA,
                                CADBACKLOG.DATA_PROMESSA,
                                CASE
                                WHEN (CADBACKLOG.TIME_SLOT = '08:00-12:00' OR CADBACKLOG.TIME_SLOT = '08:30-10:30' OR CADBACKLOG.TIME_SLOT = '10:00-12:00') THEN 'MANHÃ'
                                WHEN (CADBACKLOG.TIME_SLOT = '12:00-18:00' OR CADBACKLOG.TIME_SLOT = '13:00-15:30' OR CADBACKLOG.TIME_SLOT = '15:30-18:00') THEN 'TARDE'
                                ELSE NULL END AS MONITORAMENTO,
                                CADBACKLOG.DATA_VENDA,
                                CAST(CADBACKLOG.DESC_DETALHADA AS VARCHAR(200) CHARACTER SET WIN1252) AS DESC_DETALHADA,
                                CADBACKLOG.ABERTURA_AUX,
                                CAST(CADBACKLOG.MICRO_AREA AS VARCHAR(20) CHARACTER SET WIN1252) AS MICRO_AREA
                        FROM CADBACKLOG
                        INNER JOIN CADCONTATO ON (CADBACKLOG.INSTANCIA = CADCONTATO.DESIGNADOR)
                        LEFT OUTER JOIN CADBACKLA2 ON (CADBACKLOG.INSTANCIA = CADBACKLA2.INSTANCIA) AND (CADBACKLOG.ABERTURA_AUX  = CADBACKLA2.ABERTURA_AUX)
                        WHERE CADBACKLOG.DATA_PROMESSA = ?
                        AND CADBACKLOG.STATUS_BA = 'AGENDADA'
                        AND SUBSTRING(CADBACKLOG.SERVICO FROM 1 FOR 6) = 'DISPON'
                        AND CADBACKLOG.INSTANCIA <> '0'
                        AND CADBACKLOG.CLUSTER = 'CLUSTER PAE'
                        AND CADBACKLOG.BA = ?
                        GROUP BY CADBACKLOG.INSTANCIA,
                                CADCONTATO.CONTATO_OK,
                                CADCONTATO.CONTATO,
                                CADCONTATO.CONTATO2,
                                CADCONTATO.CONTATO3,
                                CADBACKLOG.BA,
                                CADBACKLOG.CIDADE,
                                CADBACKLOG.CLUSTER,
                                CADBACKLOG.ARMARIO,
                                CADBACKLOG.CLIENTE,
                                CADBACKLOG.LOGRADOURO,
                                CADBACKLOG.TECNOLOGIA,
                                CADBACKLOG.ABERTURA,
                                CADBACKLOG.SERVICO,
                                CADBACKLOG.STATUS,
                                CADBACKLOG.MOTIVO,
                                CADBACKLOG.STATUS_BA,
                                CADBACKLOG.DATA_PROMESSA,
                                CADBACKLOG.DATA_VENDA,
                                CADBACKLOG.DESC_DETALHADA,
                                CADBACKLOG.ABERTURA_AUX,
                                CADBACKLOG.MICRO_AREA,
                                CADBACKLOG.TIME_SLOT`;
			const query_params = [schedule_date, pon];
			const queryAsync = promisify(conn.query);
			const result = await queryAsync.call(conn, query, query_params);

			// Atribuindo a cada variável o retorno da query
			const query_designator = result[0].DESIGNADOR;
			const query_contact_verified = result[0].CONTATO_OK;
			const query_sequence = result[0].SEQUENCIA + 1;
			const query_ba = result[0].BA?.trim();
			const query_city = result[0].CIDADE;
			const query_cluster = result[0].CLUSTER;
			const query_cabinet = result[0].ARMARIO;
			const query_customer = result[0].CLIENTE;
			const query_address = result[0].LOGRADOURO;
			const query_technology = result[0].TECNOLOGIA;
			const query_created_date = result[0].ABERTURA;
			const query_service = result[0].SERVICO;
			const query_status = result[0].STATUS;
			const query_reason = result[0].MOTIVO;
			const query_status_ba = result[0].STATUS_BA;
			const query_schedule_date = result[0].DATA_PROMESSA;
			const query_sell_date = result[0].DATA_VENDA;
			const query_description = result[0].DESC_DETALHADA;
			const query_created_date_aux = result[0].ABERTURA_AUX;
			const query_micro_area = result[0].MICRO_AREA;

			// DATA_INJECAO_AUX sem hora
			let injection_date_aux = new Date();
			const month = String(injection_date_aux.getMonth() + 1).padStart(2, "0");
			const day = String(injection_date_aux.getDate()).padStart(2, "0");
			const year = injection_date_aux.getFullYear();
			injection_date_aux = month + "/" + day + "/" + year;

			// Query com ou sem o delay de 5 segundos
			let query2;

			if (message_status == "CONTATO WHATSAPP - ENTREGUE") {
				// Adicionado delay de 5 segundos no status delivered para não ficar igual ao sent
				query2 = `INSERT INTO CADBACKLA2 (NUMERO,
                                                  SEQUENCIA,
                                                  PON,
                                                  CIDADE,
                                                  CLUSTER,
                                                  ARMARIO,
                                                  CLIENTE,
                                                  LOGRADOURO,
                                                  TECNOLOGIA,
                                                  ABERTURA,
                                                  INSTANCIA,
                                                  SERVICO,
                                                  STATUS,
                                                  MOTIVO,
                                                  STATUS_BA,
                                                  DATA_PROMESSA,
                                                  DATA_VENDA,
                                                  DESC_DETALHADA,
                                                  ABERTURA_AUX,
                                                  MICRO_AREA,
                                                  DATA_INJECAO_AUX,
                                                  ASSISTENTE,
                                                  DATA_INJECAO,
                                                  TRATATIVAS,
                                                  OBSERVACAO,
                                                  CONTATO_CLIENTE_1)
                                           VALUES(gen_Id(GEN_BACKLA2, 1),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(25) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(15) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  3973,
                                                  DATEADD(5 SECOND TO CURRENT_TIMESTAMP),
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?)`;
			} else {
				query2 = `INSERT INTO CADBACKLA2 (NUMERO,
                                                  SEQUENCIA,
                                                  PON,
                                                  CIDADE,
                                                  CLUSTER,
                                                  ARMARIO,
                                                  CLIENTE,
                                                  LOGRADOURO,
                                                  TECNOLOGIA,
                                                  ABERTURA,
                                                  INSTANCIA,
                                                  SERVICO,
                                                  STATUS,
                                                  MOTIVO,
                                                  STATUS_BA,
                                                  DATA_PROMESSA,
                                                  DATA_VENDA,
                                                  DESC_DETALHADA,
                                                  ABERTURA_AUX,
                                                  MICRO_AREA,
                                                  DATA_INJECAO_AUX,
                                                  ASSISTENTE,
                                                  DATA_INJECAO,
                                                  TRATATIVAS,
                                                  OBSERVACAO,
                                                  CONTATO_CLIENTE_1)
                                           VALUES(gen_Id(GEN_BACKLA2, 1),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(25) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(15) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  3973,
                                                  CURRENT_TIMESTAMP,
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?)`;
			}
			const query2_params = [
				query_sequence,
				query_ba,
				query_city,
				query_cluster,
				query_cabinet,
				query_customer,
				query_address,
				query_technology,
				query_created_date,
				query_designator,
				query_service,
				query_status,
				query_reason,
				query_status_ba,
				query_schedule_date,
				query_sell_date,
				query_description,
				query_created_date_aux,
				query_micro_area,
				injection_date_aux,
				message_status,
				whatsapp_id,
				query_contact_verified,
			];
			const queryAsync2 = promisify(conn.query);
			await queryAsync2.call(conn, query2, query2_params);

			console.log("Insert realizado com sucesso na CADBACKLA2!");
		}
		// Insert tratativas CADBACKACE2
		else if (service_type == "TT") {
			console.log("Data agenda formatada:", formated_schedule_date);
			console.log("Data vencimento formatada:", formated_expire_date);

			// Select para o insert dos dados necessários na CADBACKACE2
			const query = `SELECT DISTINCT
                                    CAST(CADBACKTT.ISNTANCIA AS VARCHAR(25) CHARACTER SET WIN1252) AS DESIGNADOR,
                                    CADCONTATO.CONTATO_OK,
                                    CASE WHEN CADCONTATO.CONTATO = 'Nao encontrado' THEN NULL ELSE CADCONTATO.CONTATO END AS CONTATO,
                                    CASE WHEN CADCONTATO.CONTATO2 = 'Nao encontrado' THEN NULL ELSE CADCONTATO.CONTATO2 END AS CONTATO2,
                                    CASE WHEN CADCONTATO.CONTATO3 = 'Nao encontrado' THEN NULL ELSE CADCONTATO.CONTATO3 END AS CONTATO3,
                                    COALESCE(MAX(CADBACKACE2.SEQUENCIA),0) AS SEQUENCIA,
                                    CAST(CADBACKTT.CODIGO_SS AS VARCHAR(20) CHARACTER SET WIN1252) AS CODIGO_SS,
                                    CAST(CADBACKTT.ARMARIO AS VARCHAR(20) CHARACTER SET WIN1252) AS ARMARIO,
                                    CAST(CADBACKTT.STATUS AS VARCHAR(30) CHARACTER SET WIN1252) AS STATUS,
                                    CAST(CADBACKTT.RESPONSAVEL_STATUS AS VARCHAR(60) CHARACTER SET WIN1252) AS RESPONSAVEL_STATUS,
                                    CAST(CADBACKTT.MOTIVO_STATUS AS VARCHAR(60) CHARACTER SET WIN1252) AS MOTIVO_STATUS,
                                    CAST(CADBACKTT.DEFEITO AS VARCHAR(30) CHARACTER SET WIN1252) AS DEFEITO,
                                    CAST(CADBACKTT.EMPRESA AS VARCHAR(30) CHARACTER SET WIN1252) AS EMPRESA,
                                    CAST(CADBACKTT.CLUSTER AS VARCHAR(30) CHARACTER SET WIN1252) AS CLUSTER,
                                    CAST(CADBACKTT.CIDADE AS VARCHAR(80) CHARACTER SET WIN1252) AS CIDADE,
                                    CAST(CADBACKTT.UF AS VARCHAR(5) CHARACTER SET WIN1252) AS UF,
                                    CAST(CADBACKTT.LOGRADOURO AS VARCHAR(255) CHARACTER SET WIN1252) AS LOGRADOURO,
                                    CADBACKTT.ABERTURA,
                                    CADBACKTT.VENCIMENTO,
                                    CASE
                                    WHEN (CADBACKTT.TIME_SLOT = '08:00-12:00' OR CADBACKTT.TIME_SLOT = '08:30-10:30' OR CADBACKTT.TIME_SLOT = '10:00-12:00') THEN 'MANHÃ'
                                    WHEN (CADBACKTT.TIME_SLOT = '12:00-18:00' OR CADBACKTT.TIME_SLOT = '13:00-15:30' OR CADBACKTT.TIME_SLOT = '15:30-18:00') THEN 'TARDE'
                                    ELSE NULL END AS MONITORAMENTO,
                                    CAST(CADBACKTT.TIPO_SS AS VARCHAR(255) CHARACTER SET WIN1252) AS TIPO_SS,
                                    CAST(CADBACKTT.TIPO_AGENDA AS VARCHAR(150) CHARACTER SET WIN1252) AS TIPO_AGENDA,
                                    CAST(CADBACKTT.AREA_GVT AS VARCHAR(100) CHARACTER SET WIN1252) AS AREA_GVT,
                                    CADBACKTT.GPON,
                                    CAST(CADBACKTT.SUPERVISOR AS VARCHAR(80) CHARACTER SET WIN1252) AS SUPERVISOR,
                                    CAST(CADBACKTT.SEGMENTO AS VARCHAR(30) CHARACTER SET WIN1252) AS SEGMENTO,
                                    CADBACKTT.PRIMEIRA_AGENDA,
                                    CAST(CADBACKTT.ABERTURA_SIEBEL AS VARCHAR(100) CHARACTER SET WIN1252) AS ABERTURA_SIEBEL,
                                    CADBACKTT.PREVENTIVA,
                                    CADBACKTT.ABERTURA_AUX,
                                    CAST(CADBACKTT.SPLITTER AS VARCHAR(30) CHARACTER SET WIN1252) AS SPLITTER,
                                    CAST(CADBACKTT.CAIXA AS VARCHAR(30) CHARACTER SET WIN1252) AS CAIXA,
                                    CAST(CADBACKTT.SPLITTER_2 AS VARCHAR(30) CHARACTER SET WIN1252) AS SPLITTER_2,
                                    CADBACKTT.SECUNDARIO
                            FROM CADBACKTT
                            INNER JOIN CADCONTATO ON(CADBACKTT.ISNTANCIA = CADCONTATO.DESIGNADOR)
                            LEFT OUTER JOIN CADBACKACE2 ON (CADBACKTT.ISNTANCIA = CADBACKACE2.INSTANCIA) AND (CADBACKTT.ABERTURA_AUX  = CADBACKACE2.ABERTURA_AUX)
                            WHERE CADBACKTT.VENCIMENTO >= ?
                            AND CADBACKTT.VENCIMENTO < ?
                            AND CADBACKTT.STATUS = 'AGENDADA'
                            AND CADBACKTT.EMPRESA = 'TLSV'
                            AND CADBACKTT.CLUSTER = 'CLUSTER PAE'
                            AND CADBACKTT.CODIGO_SS = ?
                            GROUP BY CADBACKTT.ISNTANCIA,
                                    CADCONTATO.CONTATO_OK,
                                    CADCONTATO.CONTATO,
                                    CADCONTATO.CONTATO2,
                                    CADCONTATO.CONTATO3,
                                    CADBACKTT.CODIGO_SS,
                                    CADBACKTT.ISNTANCIA,
                                    CADBACKTT.ARMARIO,
                                    CADBACKTT.STATUS,
                                    CADBACKTT.RESPONSAVEL_STATUS,
                                    CADBACKTT.MOTIVO_STATUS,
                                    CADBACKTT.DEFEITO,
                                    CADBACKTT.EMPRESA,
                                    CADBACKTT.CLUSTER,
                                    CADBACKTT.CIDADE,
                                    CADBACKTT.UF,
                                    CADBACKTT.LOGRADOURO,
                                    CADBACKTT.ABERTURA,
                                    CADBACKTT.VENCIMENTO,
                                    CADBACKTT.TIPO_SS,
                                    CADBACKTT.TIPO_AGENDA,
                                    CADBACKTT.AREA_GVT,
                                    CADBACKTT.GPON,
                                    CADBACKTT.SUPERVISOR,
                                    CADBACKTT.SEGMENTO,
                                    CADBACKTT.PRIMEIRA_AGENDA,
                                    CADBACKTT.ABERTURA_SIEBEL,
                                    CADBACKTT.PREVENTIVA,
                                    CADBACKTT.ABERTURA_AUX,
                                    CADBACKTT.SPLITTER,
                                    CADBACKTT.CAIXA,
                                    CADBACKTT.SPLITTER_2,
                                    CADBACKTT.SECUNDARIO,
                                    CADBACKTT.TIME_SLOT`;
			const query_params = [formated_schedule_date, formated_expire_date, pon];
			const queryAsync = promisify(conn.query);
			const result = await queryAsync.call(conn, query, query_params);

			// Atribuindo a cada variável o retorno da query
			const query_designator = result[0].DESIGNADOR;
			const query_contact_verified = result[0].CONTATO_OK;
			const query_sequence = result[0].SEQUENCIA + 1;
			const query_code_ss = result[0].CODIGO_SS?.trim();
			const query_cabinet = result[0].ARMARIO;
			const query_status = result[0].STATUS;
			const query_responsible_status = result[0].RESPONSAVEL_STATUS;
			const query_reason_status = result[0].MOTIVO_STATUS;
			const query_defect = result[0].DEFEITO;
			const query_company = result[0].EMPRESA;
			const query_cluster = result[0].CLUSTER;
			const query_city = result[0].CIDADE;
			const query_state = result[0].UF;
			const query_address = result[0].LOGRADOURO;
			const query_created_date = result[0].ABERTURA;
			const query_expire_date = result[0].VENCIMENTO;
			const query_type_ss = result[0].TIPO_SS;
			const query_schedule_type = result[0].TIPO_AGENDA;
			const query_gvt_area = result[0].AREA_GVT;
			const query_gpon = result[0].GPON;
			const query_supervisor = result[0].SUPERVISOR;
			const query_segment = result[0].SEGMENTO;
			const query_first_schedule = result[0].PRIMEIRA_AGENDA;
			const query_created_siebel = result[0].ABERTURA_SIEBEL;
			const query_preventive = result[0].PREVENTIVA;
			const query_created_date_aux = result[0].ABERTURA_AUX;
			const query_splitter = result[0].SPLITTER;
			const query_box = result[0].CAIXA;
			const query_splitter2 = result[0].SPLITTER_2;
			const query_secondary = result[0].SECUNDARIO;

			// DATA_INJECAO_AUX sem hora
			let injection_date_aux = new Date();
			const month = String(injection_date_aux.getMonth() + 1).padStart(2, "0");
			const day = String(injection_date_aux.getDate()).padStart(2, "0");
			const year = injection_date_aux.getFullYear();
			injection_date_aux = month + "/" + day + "/" + year;

			// Query com ou sem o delay de 5 segundos
			let query2;

			if (message_status == "CONTATO WHATSAPP - ENTREGUE") {
				// Adicionado delay de 5 segundos no status delivered para não ficar igual ao sent
				query2 = `INSERT INTO CADBACKLA2 (NUMERO,
                                                  SEQUENCIA,
                                                  PON,
                                                  CIDADE,
                                                  CLUSTER,
                                                  ARMARIO,
                                                  CLIENTE,
                                                  LOGRADOURO,
                                                  TECNOLOGIA,
                                                  ABERTURA,
                                                  INSTANCIA,
                                                  SERVICO,
                                                  STATUS,
                                                  MOTIVO,
                                                  STATUS_BA,
                                                  DATA_PROMESSA,
                                                  DATA_VENDA,
                                                  DESC_DETALHADA,
                                                  ABERTURA_AUX,
                                                  MICRO_AREA,
                                                  DATA_INJECAO_AUX,
                                                  ASSISTENTE,
                                                  DATA_INJECAO,
                                                  TRATATIVAS,
                                                  OBSERVACAO,
                                                  CONTATO_CLIENTE_1)
                                           VALUES(gen_Id(GEN_BACKLA2, 1),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(25) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(15) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  3973,
                                                  DATEADD(5 SECOND TO CURRENT_TIMESTAMP),
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?)`;
			} else {
				query2 = `INSERT INTO CADBACKLA2 (NUMERO,
                                                  SEQUENCIA,
                                                  PON,
                                                  CIDADE,
                                                  CLUSTER,
                                                  ARMARIO,
                                                  CLIENTE,
                                                  LOGRADOURO,
                                                  TECNOLOGIA,
                                                  ABERTURA,
                                                  INSTANCIA,
                                                  SERVICO,
                                                  STATUS,
                                                  MOTIVO,
                                                  STATUS_BA,
                                                  DATA_PROMESSA,
                                                  DATA_VENDA,
                                                  DESC_DETALHADA,
                                                  ABERTURA_AUX,
                                                  MICRO_AREA,
                                                  DATA_INJECAO_AUX,
                                                  ASSISTENTE,
                                                  DATA_INJECAO,
                                                  TRATATIVAS,
                                                  OBSERVACAO,
                                                  CONTATO_CLIENTE_1)
                                           VALUES(gen_Id(GEN_BACKLA2, 1),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(255) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(30) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(25) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(15) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(150) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?,
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  CAST(? AS VARCHAR(20) CHARACTER SET WIN1252),
                                                  ?,
                                                  3973,
                                                  CURRENT_TIMESTAMP,
                                                  CAST(? AS VARCHAR(200) CHARACTER SET WIN1252),
                                                  ?,
                                                  ?)`;
			}
			const query2_params = [
				query_code_ss,
				query_designator,
				query_cabinet,
				query_status,
				query_responsible_status,
				query_reason_status,
				query_defect,
				query_company,
				query_cluster,
				query_city,
				query_state,
				query_address,
				query_created_date,
				query_expire_date,
				query_type_ss,
				query_schedule_type,
				query_gvt_area,
				query_gpon,
				query_supervisor,
				query_segment,
				query_first_schedule,
				query_created_siebel,
				query_preventive,
				query_created_date_aux,
				query_splitter,
				query_box,
				query_splitter2,
				query_secondary,
				message_status,
				query_sequence,
				injection_date_aux,
				whatsapp_id,
				query_contact_verified,
			];
			const queryAsync2 = promisify(conn.query);
			await queryAsync2.call(conn, query2, query2_params);

			console.log("Insert realizado com sucesso na CADBACKACE2!");
		} else {
			console.log("Tipo de serviço inválido!");
		}

		conn.detach();
	} catch (error) {
		console.log(error);
		throw error;
	}
}

module.exports = { processWebhookResponse };
