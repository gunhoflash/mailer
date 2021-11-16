/* eslint-disable @typescript-eslint/no-non-null-assertion */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
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
    origin: function (origin, callback) {
      if (origin && (whitelist as string[]).indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  }));
} else {
  console.log('Whitelist not found, allow all origin.');
  app.use(cors());
}

app.post('/send-mail', (req, res) => {
  const { account, from, to, subject, message, contentType } = req.body;

  if (!mailers.has(account)) mailers.set(account, new Mailer(account));

  const nMailSent = mailers.get(account)!.sendMail({ from, to, subject, message, contentType });
  res.send(nMailSent);
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

if (!HTTP_PORT && !HTTPS_PORT) {
  console.error('HTTP_PORT or HTTPS_PORT are required');
  process.exit(1);
}

if (HTTP_PORT) {
  http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`http server listen: ${HTTP_PORT}`);
  });
}

if (HTTPS_PORT) {
  const options = {
    key: process.env.SSL_KEY,
    cert: process.env.SSL_CERT,
  };

  https.createServer(options, app).listen(HTTPS_PORT, () => {
    console.log(`https server listen: ${HTTPS_PORT} with options: ${JSON.stringify(options)}`);
  });
}