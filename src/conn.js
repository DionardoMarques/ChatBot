require("dotenv/config");
const Firebird = require("node-firebird");

const options = {};

options.host = process.env.HOST;
options.database = process.env.DATABASE;
options.user = process.env.USER;
options.password = process.env.PASSWORD;

module.exports = { Firebird, options };
