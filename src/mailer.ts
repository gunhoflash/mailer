/* eslint-disable no-undef */
import { readFile, writeFile } from 'fs/promises';
import readline from 'readline';
import { gmail_v1, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

type Credentials = {
  installed: {
    client_id: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_secret: string;
    redirect_uris: string[];
  }
}

// To check all scopes: https://developers.google.com/identity/protocols/oauth2/scopes?hl=en
// If modifying these scopes, delete the token file.
const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.send',
];

const base64Encode = (message: string) => Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

export const getOAuth2Client = async (credentialsName: string, tokenName: string, noTokenInitialize = false) => {
  const credentialsPath = `credentials/credentials.${credentialsName}.json`;
  const tokenPath = `token/token.${tokenName}.json`;

  try {
    // Load client secrets from a local file.
    const content: any = await readFile(credentialsPath);

    // Authorize a client with credentials
    return await authorize(JSON.parse(content), tokenPath, noTokenInitialize);
  } catch (e) {
    console.error('Error on getOAuth2Client():', e);
    return null;
  }
};

// Create an OAuth2 client with the given credentials
const authorize = async (credentials: Credentials, tokenPath: string, noTokenInitialize = false) => {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  try {
    // Check if we have previously stored a token.
    const token: any = await readFile(tokenPath);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch (e) {
    // Token file not found
    if (noTokenInitialize) {
      throw 'Token file not found!';
    }
    return await getNewToken(oAuth2Client, tokenPath);
  }
};

// Get and store new token after prompting for user authorization
const getNewToken = (oAuth2Client: OAuth2Client, tokenPath: string) => new Promise<OAuth2Client>((resolve, reject) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
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

      // Store the token to disk for later program executions
      try {
        await writeFile(tokenPath, JSON.stringify(token));
        console.log('Token stored to', tokenPath);
        return resolve(oAuth2Client);
      } catch (e) {
        console.error(e);
        return reject();
      }
    });
  });
});

export interface Mail {
  from: string;
  to: string;
  subject: string;
  message: string;
  contentType: 'text/plain' | 'text/html';
}

export interface FailedMail extends Mail {
  failReason?: Error;
  timestamp?: number;
}

export default class Mailer {
  #gmail: gmail_v1.Gmail | null = null;
  #account: string;
  #mailQueue: Mail[];
  #failedMails: FailedMail[];

  constructor(account: string) {
    this.#account = account;
    this.#mailQueue = [];
    this.#failedMails = [];
    this.initClient();
  }

  async initClient() {
    this.#gmail = null;
    const oAuth2Client = await getOAuth2Client(this.#account, this.#account, true);
    if (oAuth2Client) {
      this.#gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
      this.sendMail();
    }
  }

  sendMail(mail?: Mail) {
    if (mail) this.#mailQueue.push(mail);
    if (!this.#gmail) return 0;

    let nMailSent = 0;
    for (const mail of this.#mailQueue) {
      const { from, to, subject, message, contentType = 'text/plain' } = mail;
      this.#gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: base64Encode(
            `From: ${from}\n` +
            `To: ${to}\n` +
            `Subject: ${subject}\n` +
            'MIME-Version: 1.0\n' +
            `Content-Type: ${contentType}; charset="UTF-8"\n` + // text/plain, text/html
            'Content-Transfer-Encoding: message/rfc2822\n' + // 7bit, quoted-printable
            '\n' +
            `${message}\n`
          ),
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
