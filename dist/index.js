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
const morgan_1 = __importDefault(require("morgan"));
const mailer_1 = __importDefault(require("./mailer"));
const whitelist_json_1 = __importDefault(require("../whitelist.json"));
dotenv_1.default.config({ path: './config/.env' });
const mailers = new Map();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)('combined'));
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
const checkSecret = (account, secret) => account && secret && (secret === process.env[`secret_${account}`]);
const getMailer = async (account) => {
    let mailer = mailers.get(account);
    if (!mailer) {
        mailer = new mailer_1.default(account);
        mailers.set(account, mailer);
        await mailer.initClient();
    }
    return mailer;
};
app.post('/send-mail', async (req, res) => {
    const { account, from, to, subject, message, contentType, secret } = req.body;
    if (!checkSecret(account, secret) || !from || !to || !subject || !message || !contentType) {
        return res.status(400).send('Invalid body');
    }
    const mailer = await getMailer(account);
    const nMailSent = await mailer.sendMail({ from, to, subject, message, contentType });
    res.json({
        result: nMailSent,
    });
});
app.post('/mail-queue/:account', async (req, res) => {
    const { account } = req.params;
    const { secret } = req.body;
    if (!checkSecret(account, secret)) {
        return res.status(400).send('Invalid body');
    }
    const mailer = await getMailer(account);
    res.json({
        result: mailer.getMailQueue(),
    });
});
app.post('/failed-mail/:account', async (req, res) => {
    const { account } = req.params;
    const { secret } = req.body;
    if (!checkSecret(account, secret)) {
        return res.status(400).send('Invalid body');
    }
    const mailer = await getMailer(account);
    res.json({
        result: mailer.getFailedMails(),
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
