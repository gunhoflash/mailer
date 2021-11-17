"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const mailer_1 = __importDefault(require("./mailer"));
const whitelist_json_1 = __importDefault(require("../whitelist.json"));
dotenv_1.default.config({ path: './config/.env' });
const mailers = new Map();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
if (whitelist_json_1.default.length) {
    console.log('Use whitelist:', whitelist_json_1.default);
    app.use((0, cors_1.default)({
        origin: whitelist_json_1.default,
    }));
}
else {
    console.log('Whitelist not found, allow all origin.');
    app.use((0, cors_1.default)());
}
app.post('/send-mail', (req, res) => {
    const { account, from, to, subject, message, contentType } = req.body;
    if (!account || !from || !to || !subject || !message || !contentType) {
        return res.status(400).send('Invalid body');
    }
    if (!mailers.has(account))
        mailers.set(account, new mailer_1.default(account));
    const nMailSent = mailers.get(account).sendMail({ from, to, subject, message, contentType });
    res.json({
        result: nMailSent,
    });
});
app.get('/mail-queue/:account', (req, res) => {
    const { account } = req.params;
    if (!account) {
        return res.status(400).send('Account is required');
    }
    if (!mailers.has(account))
        mailers.set(account, new mailer_1.default(account));
    res.json({
        result: mailers.get(account).getMailQueue(),
    });
});
app.get('/failed-mail/:account', (req, res) => {
    const { account } = req.params;
    if (!account) {
        return res.status(400).send('Account is required');
    }
    if (!mailers.has(account))
        mailers.set(account, new mailer_1.default(account));
    res.json({
        result: mailers.get(account).getFailedMails(),
    });
});
const HTTP_PORT = process.env.HTTP_PORT;
const HTTPS_PORT = process.env.HTTPS_PORT;
const SSL_CA = process.env.SSL_CA;
const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;
if (!HTTP_PORT && !HTTPS_PORT) {
    console.error('HTTP_PORT or HTTPS_PORT are required');
    process.exit(1);
}
if (HTTP_PORT) {
    http_1.default.createServer(app).listen(HTTP_PORT, () => {
        console.log(`http server listen: ${HTTP_PORT}`);
    });
}
if (HTTPS_PORT && SSL_CA && SSL_KEY && SSL_CERT) {
    const options = {
        ca: fs_1.default.readFileSync(SSL_CA),
        key: fs_1.default.readFileSync(SSL_KEY),
        cert: fs_1.default.readFileSync(SSL_CERT),
        requestCert: false,
        rejectUnauthorized: false
    };
    https_1.default.createServer(options, app).listen(HTTPS_PORT, () => {
        console.log(`https server listen: ${HTTPS_PORT}`);
    });
}
