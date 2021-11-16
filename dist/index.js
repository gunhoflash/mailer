"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
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
        origin: function (origin, callback) {
            if (origin && whitelist_json_1.default.indexOf(origin) !== -1) {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    }));
}
else {
    console.log('Whitelist not found, allow all origin.');
    app.use((0, cors_1.default)());
}
app.post('/send-mail', (req, res) => {
    const { account, from, to, subject, message, contentType } = req.body;
    if (!mailers.has(account))
        mailers.set(account, new mailer_1.default(account));
    const nMailSent = mailers.get(account).sendMail({ from, to, subject, message, contentType });
    res.send(nMailSent);
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
if (!HTTP_PORT && !HTTPS_PORT) {
    console.error('HTTP_PORT or HTTPS_PORT are required');
    process.exit(1);
}
if (HTTP_PORT) {
    http_1.default.createServer(app).listen(HTTP_PORT, () => {
        console.log(`http server listen: ${HTTP_PORT}`);
    });
}
if (HTTPS_PORT) {
    const options = {
        key: process.env.SSL_KEY,
        cert: process.env.SSL_CERT,
    };
    https_1.default.createServer(options, app).listen(HTTPS_PORT, () => {
        console.log(`https server listen: ${HTTPS_PORT} with options: ${JSON.stringify(options)}`);
    });
}
