const { promisify } = require("util");
const { Firebird, options } = require("./conn");

const attachAsync = promisify(Firebird.attach);

async function fetchCustomersPhones() {
	try {
		const conn = await attachAsync(options);

		const query = "SELECT * FROM CADWHATS";
		const query_params = [];
		const queryAsync = promisify(conn.query);
		const result = await queryAsync.call(conn, query, query_params);

		console.log("Resultado da query:", result);

		conn.detach();
	} catch (error) {
		console.error(error);
		throw error;
	}
}

module.exports = { fetchCustomersPhones };
