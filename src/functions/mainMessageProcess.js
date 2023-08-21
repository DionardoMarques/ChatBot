require("dotenv/config");

const { fetchCustomersPhones } = require("../queries/fetchCustomersPhones");
const { sendConfirmaVisita, sendMessageTest } = require("../message");
const { noValidContact } = require("../queries/noValidContact");

async function mainMessageProcess(res) {
	try {
		const token = process.env.TOKEN;
		const sender_phone = process.env.SENDER_PHONE;

		const valid_contacts = await fetchCustomersPhones();
		console.table(valid_contacts);

		valid_contacts.forEach((customer) => {
			const service_type = customer[0];
			const designator = customer[1];
			const contact_verified = customer[2];
			const contact = customer[3];
			const contact2 = customer[4];
			const contact3 = customer[5];
			const pon = customer[6];
			const display_schedule_date = customer[7];
			const formated_schedule_date = customer[8];
			const shift = customer[9];

			// Utilizando o contato OK (já foi validado/recebeu mensagens) não é nulo
			if (contact_verified != null) {
				// Template (gera custo)
				// sendConfirmaVisita(
				// 	designator,
				// 	pon,
				// 	token,
				// 	sender_phone,
				// 	contact_verified,
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
					contact_verified,
					formated_schedule_date,
					shift,
					service_type
				);
			}
			// Utilizando os contatos armazenado pelo ZeusBot
			else {
				if (contact != null) {
					// Template (gera custo)
					// sendConfirmaVisita(
					// 	designator,
					// 	pon,
					// 	token,
					// 	sender_phone,
					// 	contact,
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
						contact,
						formated_schedule_date,
						shift,
						service_type
					);
				} else {
					if (contact2 != null) {
						// Template (gera custo)
						// sendConfirmaVisita(
						// 	designator,
						// 	pon,
						// 	token,
						// 	sender_phone,
						// 	contact2,
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
							contact2,
							formated_schedule_date,
							shift,
							service_type
						);
					} else {
						if (contact3 != null) {
							// Template (Gera custo)
							// sendConfirmaVisita(
							// 	designator,
							// 	pon,
							// 	token,
							// 	sender_phone,
							// 	contact3,
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
								contact3,
								formated_schedule_date,
								shift,
								service_type
							);
						} else {
							console.log("Não existem números de contato para este cliente!");

							// Insert na CADWHATS para caso não existam telefones
							noValidContact(
								designator,
								pon,
								formated_schedule_date,
								shift,
								service_type
							);
						}
					}
				}
			}
		});

		return res.sendStatus(200);
	} catch (error) {
		console.log(error);
		throw error;
	}
}

module.exports = { mainMessageProcess };
