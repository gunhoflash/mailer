"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOAuth2Client = void 0;
const promises_1 = require("fs/promises");
const readline_1 = __importDefault(require("readline"));
const googleapis_1 = require("googleapis");
const SCOPES = [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/gmail.send',
];
const base64Encode = (message) => Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const getOAuth2Client = async (credentialsName, tokenName, noTokenInitialize = false) => {
    const credentialsPath = `credentials/credentials.${credentialsName}.json`;
    const tokenPath = `token/token.${tokenName}.json`;
    try {
        const content = await (0, promises_1.readFile)(credentialsPath);
        return await authorize(JSON.parse(content), tokenPath, noTokenInitialize);
    }
    catch (e) {
        console.error('Error on getOAuth2Client():', e);
        return null;
    }
};
exports.getOAuth2Client = getOAuth2Client;
const authorize = async (credentials, tokenPath, noTokenInitialize = false) => {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    try {
        const token = await (0, promises_1.readFile)(tokenPath);
        oAuth2Client.setCredentials(JSON.parse(token));
        return oAuth2Client;
    }
    catch (e) {
        if (noTokenInitialize) {
            throw 'Token file not found!';
        }
        return await getNewToken(oAuth2Client, tokenPath);
    }
};
const getNewToken = (oAuth2Client, tokenPath) => new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', code => {
        rl.close();
        oAuth2Client.getToken(code, async (err, token) => {
            if (err) {
                console.error('Error retrieving access token', err);
                return reject();
            }
            if (!token) {
                console.error('No token retrieved');
                return reject();
            }
            oAuth2Client.setCredentials(token);
            try {
                await (0, promises_1.writeFile)(tokenPath, JSON.stringify(token));
                console.log('Token stored to', tokenPath);
                return resolve(oAuth2Client);
            }
            catch (e) {
                console.error(e);
                return reject();
            }
        });
    });
});
class Mailer {
    #gmail = null;
    #account;
    #mailQueue;
    #failedMails;
    constructor(account) {
        this.#account = account;
        this.#mailQueue = [];
        this.#failedMails = [];
        this.initClient();
    }
    async initClient() {
        this.#gmail = null;
        const oAuth2Client = await (0, exports.getOAuth2Client)(this.#account, this.#account, true);
        if (oAuth2Client) {
            this.#gmail = googleapis_1.google.gmail({ version: 'v1', auth: oAuth2Client });
            this.sendMail();
        }
    }
    sendMail(mail) {
        if (mail)
            this.#mailQueue.push(mail);
        if (!this.#gmail)
            return 0;
        let nMailSent = 0;
        for (const mail of this.#mailQueue) {
            const { from, to, subject, message, contentType = 'text/plain' } = mail;
            this.#gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: base64Encode(`From: ${from}\n` +
                        `To: ${to}\n` +
                        `Subject: ${subject}\n` +
                        'MIME-Version: 1.0\n' +
                        `Content-Type: ${contentType}; charset="UTF-8"\n` +
                        'Content-Transfer-Encoding: message/rfc2822\n' +
                        '\n' +
                        `${message}\n`),
                },
            }, (err, res) => {
                if (err) {
                    this.#failedMails.push({ ...mail, failReason: err, timestamp: Date.now() });
                    return console.log('The API returned an error: ' + err);
                }
                nMailSent++;
                console.log(`Message sent with ID: ${res?.data.id}`);
            });
        }
        this.#mailQueue = [];
        return nMailSent;
    }
    getMailQueue() {
        return this.#mailQueue;
    }
    getFailedMails() {
        return this.#failedMails;
    }
}
exports.default = Mailer;
