const { promisify } = require("util");

async function fetchCustomersPhones(conn) {
	try {
		// Remover os filtros CADCONTATO.DESIGNADOR -- Apenas para teste
		const query = `SELECT SERVICO,
                              DESIGNADOR,
                              CONTATO_OK,
                              CONTATO,
                              CONTATO2,
                              CONTATO3,
                              PON,
                              DATA_AGENDA,
                              MONITORAMENTO
                       FROM(SELECT DISTINCT CAST('BA' AS CHAR(2)) AS SERVICO,
                                            CADBACKLOG.INSTANCIA AS DESIGNADOR,
                                            CADCONTATO.CONTATO_OK,
                                            CADCONTATO.CONTATO,
                                            CADCONTATO.CONTATO2,
                                            CADCONTATO.CONTATO3,
                                            CAST(CADBACKLOG.BA AS VARCHAR(20)) AS PON,
                                            CAST(CADBACKLOG.DATA_PROMESSA AS DATE) AS DATA_AGENDA,
                                            CASE 
                                                WHEN (CADBACKLOG.TIME_SLOT = '08:00-12:00' OR CADBACKLOG.TIME_SLOT = '08:30-10:30' OR CADBACKLOG.TIME_SLOT = '10:00-12:00') THEN 'MANHÃ'
                                                WHEN (CADBACKLOG.TIME_SLOT = '12:00-18:00' OR CADBACKLOG.TIME_SLOT = '13:00-15:30' OR CADBACKLOG.TIME_SLOT = '15:30-18:00') THEN 'TARDE'
                                            ELSE NULL END AS MONITORAMENTO
                            FROM CADBACKLOG 
                            INNER JOIN CADCONTATO ON (CADBACKLOG.INSTANCIA = CADCONTATO.DESIGNADOR)
                            LEFT OUTER JOIN CADBACKLA2 ON (CADBACKLOG.INSTANCIA = CADBACKLA2.INSTANCIA) AND (CADBACKLOG.ABERTURA_AUX  = CADBACKLA2.ABERTURA_AUX)
                            WHERE CADBACKLOG.DATA_PROMESSA = DATEADD(1 DAY TO CAST('TODAY' AS DATE))
                            AND CADBACKLOG.STATUS_BA = 'AGENDADA' 
                            AND SUBSTRING(CADBACKLOG.SERVICO FROM 1 FOR 6) = 'DISPON'
                            AND CADBACKLOG.INSTANCIA <> '0'
                            AND CADBACKLOG.CLUSTER = 'CLUSTER PAE'
                            AND CADCONTATO.DESIGNADOR = 'X'
                            GROUP BY CADBACKLOG.INSTANCIA,
                                    CADCONTATO.CONTATO_OK,
                                    CADCONTATO.CONTATO,
                                    CADCONTATO.CONTATO2,
                                    CADCONTATO.CONTATO3, 
                                    CADBACKLOG.BA,
                                    CADBACKLOG.DATA_PROMESSA,
                                    CADBACKLOG.TIME_SLOT
                                
                            UNION ALL

                            SELECT DISTINCT CAST('TT' AS CHAR(2)) AS SERVICO,
                                            CADBACKTT.ISNTANCIA AS DESIGNADOR,
                                            CADCONTATO.CONTATO_OK,
                                            CADCONTATO.CONTATO,
                                            CADCONTATO.CONTATO2,
                                            CADCONTATO.CONTATO3,
                                            CADBACKTT.CODIGO_SS AS PON,
                                            CAST(CADBACKTT.VENCIMENTO AS DATE) AS DATA_AGENDA,
                                            CASE 
                                                WHEN (CADBACKTT.TIME_SLOT = '08:00-12:00' OR CADBACKTT.TIME_SLOT = '08:30-10:30' OR CADBACKTT.TIME_SLOT = '10:00-12:00') THEN 'MANHÃ'
                                                WHEN (CADBACKTT.TIME_SLOT = '12:00-18:00' OR CADBACKTT.TIME_SLOT = '13:00-15:30' OR CADBACKTT.TIME_SLOT = '15:30-18:00') THEN 'TARDE'
                                            ELSE CADBACKTT.TIME_SLOT END AS MONITORAMENTO
                            FROM CADBACKTT 
                            INNER JOIN CADCONTATO ON(CADBACKTT.ISNTANCIA = CADCONTATO.DESIGNADOR) 
                            LEFT OUTER JOIN CADBACKACE2 ON (CADBACKTT.ISNTANCIA = CADBACKACE2.INSTANCIA) AND (CADBACKTT.ABERTURA_AUX  = CADBACKACE2.ABERTURA_AUX)
                            WHERE CADBACKTT.VENCIMENTO >= DATEADD(1 DAY TO CAST('TODAY' AS DATE))
                            AND CADBACKTT.VENCIMENTO < DATEADD(2 DAY TO CAST('TODAY' AS DATE))
                            AND CADBACKTT.STATUS = 'AGENDADA' 
                            AND CADBACKTT.EMPRESA = 'TLSV' 
                            AND CADBACKTT.CLUSTER = 'CLUSTER PAE'
                            AND CADCONTATO.DESIGNADOR = 'PAE-814T9JA5XI-013'
                        GROUP BY CADBACKTT.ISNTANCIA,
                            CADCONTATO.CONTATO_OK,
                            CADCONTATO.CONTATO,
                            CADCONTATO.CONTATO2,
                            CADCONTATO.CONTATO3,
                            CADBACKTT.CODIGO_SS,
                            CADBACKTT.VENCIMENTO,
                            CADBACKTT.TIME_SLOT)`;
		const queryAsync = promisify(conn.query);
		const result = await queryAsync.call(conn, query);

		const valids_contacts = [];

		result.forEach((element) => {
			const service_type = element.SERVICO?.trim();
			const designator = element.DESIGNADOR?.trim();

			let contact_verified = element.CONTATO_OK?.trim();
			let contact = element.CONTATO?.trim();
			let contact2 = element.CONTATO2?.trim();
			let contact3 = element.CONTATO3?.trim();

			const pon = element.PON?.trim();

			// Formatando para ser somente data "DD/MM/AAAA"
			let display_schedule_date = element.DATA_AGENDA;
			display_schedule_date = display_schedule_date.toLocaleDateString("pt-BR");

			// Formatando para "MM/DD/AAAA"
			const [day, month, year] = display_schedule_date.split("/");
			const formated_schedule_date = `${month}/${day}/${year}`;

			const shift = element.MONITORAMENTO?.trim();

			// Transformando o campo CONTATO_OK em null caso venha sem string
			if (contact_verified == "" || typeof contact_verified == "undefined") {
				contact_verified = null;
			}

			// Removendo o código de área (+55) para padronizar todos os números
			if (contact_verified != null && contact_verified !== "") {
				contact_verified = contact_verified.replace("+55", "");
			}

			if (contact != null && contact !== "") {
				contact = contact.replace("+55", "");
			}

			if (contact2 != null && contact2 !== "") {
				contact2 = contact2.replace("+55", "");
			}

			if (contact3 != null && contact3 !== "") {
				contact3 = contact3.replace("+55", "");
			}

			// Verificando se é um número com dígitos e sem caracteres repetidos
			let valid_contact_verified = isValidNumber(contact_verified);
			let valid_contact = isValidNumber(contact);
			let valid_contact2 = isValidNumber(contact2);
			let valid_contact3 = isValidNumber(contact3);

			// Adicionando o código postal para todos os telefones válidos
			if (valid_contact_verified != null) {
				valid_contact_verified = "+55" + valid_contact_verified;
			}

			if (valid_contact != null) {
				valid_contact = "+55" + valid_contact;
			}

			if (valid_contact2 != null) {
				valid_contact2 = "+55" + valid_contact2;
			}

			if (valid_contact3 != null) {
				valid_contact3 = "+55" + valid_contact3;
			}

			// Quando a coluna turno vier 0 o cliente não será enviado para o array
			if (shift != "0") {
				valids_contacts.push([
					service_type,
					designator,
					valid_contact_verified,
					valid_contact,
					valid_contact2,
					valid_contact3,
					pon,
					display_schedule_date,
					formated_schedule_date,
					shift,
				]);
			}
		});

		return valids_contacts;
	} catch (error) {
		console.error(error);
		throw error;
	}
}

function isValidNumber(number) {
	// Verifica se o número contém apenas dígitos
	if (!/^\d+$/.test(number)) {
		return null;
	}

	const repeating_char = number[0];

	// Verifica se o número tem o mesmo padrão de caracteres repetidos
	if (number.split("").every((digit) => digit === repeating_char)) {
		return null;
	}

	// Verifica se o tamanho é de 10 ou 11 dígitos
	if (number.length != 10 && number.length != 11) {
		return null;
	}

	return number;
}

module.exports = { fetchCustomersPhones };
