"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const readline_1 = __importDefault(require("readline"));
const mailer_1 = require("./mailer");
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const prompt = () => {
    rl.question('Enter an account to initialize(Enter \'exit\' to exit): ', async (input) => {
        const account = input.trim();
        if (account) {
            if (account === 'exit') {
                rl.close();
                return;
            }
            await (0, mailer_1.getOAuth2Client)(account, account);
            console.log(`Token for ${account} initialized.`);
        }
        prompt();
    });
};
prompt();
