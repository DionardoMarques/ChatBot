const { fetchCustomersPhones } = require("./queries/fetchCustomersPhones");
const { insertSendedMessage } = require("./queries/insertSendedMessage");

console.log("Rodando a aplicação...");

fetchCustomersPhones();
