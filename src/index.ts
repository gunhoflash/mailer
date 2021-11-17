/* eslint-disable @typescript-eslint/no-non-null-assertion */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import Mailer from './mailer';
import whitelist from '../whitelist.json';

dotenv.config({ path: './config/.env' });

const mailers = new Map<string, Mailer>();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
if (whitelist.length) {
  console.log('Use whitelist:', whitelist);
  app.use(cors({
    origin: whitelist as string[],
  }));
} else {
  console.log('Whitelist not found, allow all origin.');
  app.use(cors());
}

app.post('/send-mail', (req, res) => {
  const { account, from, to, subject, message, contentType } = req.body;

  if (!account || !from || !to || !subject || !message || !contentType) {
    return res.status(400).send('Invalid body');
  }

  if (!mailers.has(account)) mailers.set(account, new Mailer(account));

  const nMailSent = mailers.get(account)!.sendMail({ from, to, subject, message, contentType });
  res.json({
    result: nMailSent,
  });
});

app.get('/mail-queue/:account', (req, res) => {
  const { account } = req.params;

  if (!account) {
    return res.status(400).send('Account is required');
  }

  if (!mailers.has(account)) mailers.set(account, new Mailer(account));

  res.json({
    result: mailers.get(account)!.getMailQueue(),
  });
});

app.get('/failed-mail/:account', (req, res) => {
  const { account } = req.params;

  if (!account) {
    return res.status(400).send('Account is required');
  }

  if (!mailers.has(account)) mailers.set(account, new Mailer(account));

  res.json({
    result: mailers.get(account)!.getFailedMails(),
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
  http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`http server listen: ${HTTP_PORT}`);
  });
}

if (HTTPS_PORT && SSL_CA && SSL_KEY && SSL_CERT) {
  const options = {
    ca: fs.readFileSync(SSL_CA),
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
    requestCert: false,
    rejectUnauthorized: false
  };

  https.createServer(options, app).listen(HTTPS_PORT, () => {
    console.log(`https server listen: ${HTTPS_PORT}`);
  });
}