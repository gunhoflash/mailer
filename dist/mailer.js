"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOAuth2Client = exports.refreshToken = void 0;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const readline_1 = __importDefault(require("readline"));
const googleapis_1 = require("googleapis");
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
];
const tokenDirectoryName = 'token';
const getTokenPath = (tokenName) => `${tokenDirectoryName}/token.${tokenName}.json`;
const base64Encode = (message) => Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const refreshToken = async (oAuth2Client, tokenName) => {
    if (oAuth2Client.credentials.expiry_date > Date.now() + 10000) {
        return false;
    }
    console.log('Refreshing token...');
    try {
        const prev_access_token = oAuth2Client.credentials.access_token;
        const { token, res } = await oAuth2Client.getAccessToken();
        if (token) {
            console.log('Got a new token.');
            oAuth2Client.credentials.access_token = token;
        }
        else if (res?.data) {
            console.log('No token returned.');
            oAuth2Client.setCredentials(res.data);
        }
        if (oAuth2Client.credentials.access_token !== prev_access_token) {
            writeTokenFile(tokenName, oAuth2Client.credentials);
            console.log('Token refreshed');
            return true;
        }
    }
    catch (e) {
        console.error('Error on refreshToken:', e);
    }
    return false;
};
exports.refreshToken = refreshToken;
const getOAuth2Client = async (credentialsName, tokenName, noTokenInitialize = false) => {
    const credentialsPath = `credentials/credentials.${credentialsName}.json`;
    try {
        const content = await (0, promises_1.readFile)(credentialsPath);
        return await authorize(JSON.parse(content), tokenName, noTokenInitialize);
    }
    catch (e) {
        console.error('Error on getOAuth2Client():', e);
        return null;
    }
};
exports.getOAuth2Client = getOAuth2Client;
const authorize = async (credentials, tokenName, noTokenInitialize = false) => {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    let token;
    try {
        token = JSON.parse(await (0, promises_1.readFile)(getTokenPath(tokenName)));
        oAuth2Client.setCredentials(token);
    }
    catch (e) {
        if (noTokenInitialize) {
            throw 'Token file not found!';
        }
        return await getNewToken(oAuth2Client, tokenName);
    }
    return oAuth2Client;
};
const getNewToken = (oAuth2Client, tokenName) => new Promise((resolve, reject) => {
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
            writeTokenFile(tokenName, token);
            return resolve(oAuth2Client);
        });
    });
});
const writeTokenFile = async (tokenName, token) => {
    console.log('Writing token to file...');
    const tokenPath = getTokenPath(tokenName);
    const dir = `${tokenDirectoryName}`;
    try {
        try {
            await (0, promises_1.access)(dir, fs_1.constants.F_OK);
        }
        catch (e) {
            await (0, promises_1.mkdir)(dir);
        }
        await (0, promises_1.writeFile)(tokenPath, JSON.stringify(token));
        console.log('Token stored to', tokenPath);
    }
    catch (e) {
        console.log(e);
    }
};
class Mailer {
    #gmail = null;
    #oAuth2Client = null;
    #account;
    #mailQueue;
    #failedMails;
    constructor(account) {
        this.#account = account;
        this.#mailQueue = [];
        this.#failedMails = [];
    }
    async initClient() {
        this.#oAuth2Client = await (0, exports.getOAuth2Client)(this.#account, this.#account, true);
        if (this.#oAuth2Client) {
            this.#gmail = googleapis_1.google.gmail({ version: 'v1', auth: this.#oAuth2Client });
        }
        else {
            console.error('Failed to initialize client');
        }
    }
    async sendMail(mail) {
        if (!this.#gmail || !this.#oAuth2Client) {
            throw new Error('Client not initialized');
        }
        if (mail)
            this.#mailQueue.push(mail);
        if (await (0, exports.refreshToken)(this.#oAuth2Client, this.#account)) {
            this.#gmail = googleapis_1.google.gmail({ version: 'v1', auth: this.#oAuth2Client });
        }
        let nMailSent = 0;
        for (const mail of this.#mailQueue) {
            const { from, to, subject, message, contentType = 'text/plain' } = mail;
            try {
                const result = await this.#gmail.users.messages.send({
                    userId: 'me',
                    requestBody: {
                        raw: base64Encode(`From: ${from}\n` +
                            `To: ${to}\n` +
                            `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=\n` +
                            'MIME-Version: 1.0\n' +
                            `Content-Type: ${contentType}; charset=utf-8\n` +
                            '\n' +
                            `${message}\n`),
                    },
                });
                if (result.data.id) {
                    console.log(`Message sent with ID: ${result.data.id}`);
                    nMailSent++;
                }
                else {
                    throw {
                        message: 'No message ID returned',
                        result,
                    };
                }
            }
            catch (err) {
                this.#failedMails.push({ ...mail, failReason: err, timestamp: Date.now() });
                console.error('The API returned an error: ' + err);
            }
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
