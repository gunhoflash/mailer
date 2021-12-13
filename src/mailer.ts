/* eslint-disable no-undef */
import { constants } from 'fs';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import readline from 'readline';
import { gmail_v1, google } from 'googleapis';
import { Credentials, OAuth2Client } from 'google-auth-library';

type CredentialFileContent = {
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

const tokenDirectoryName = 'token';
const getTokenPath = (tokenName: string) => `${tokenDirectoryName}/token.${tokenName}.json`;
const base64Encode = (message: string) => Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const refreshToken = async (oAuth2Client: OAuth2Client, tokenName: string) => {
  if (oAuth2Client.credentials.expiry_date! > Date.now() + 10000) {
    return false;
  }

  console.log('Refreshing token...');
  try {
    // If the token is expired or about to expire, get a new one.
    const prev_access_token = oAuth2Client.credentials.access_token;
    const { token, res } = await oAuth2Client.getAccessToken();
    if (token) {
      oAuth2Client.credentials.access_token = token;
    } else if (res?.data) {
      oAuth2Client.setCredentials(res.data);
    }
    if (oAuth2Client.credentials.access_token !== prev_access_token) {
      writeTokenFile(tokenName, oAuth2Client.credentials);
      console.log('Token refreshed');
      return true;
    }
  } catch (e) {
    console.error('Error on refreshToken()', e);
  }
  return false;
};

export const getOAuth2Client = async (credentialsName: string, tokenName: string, noTokenInitialize = false) => {
  const credentialsPath = `credentials/credentials.${credentialsName}.json`;

  try {
    // Load client secrets from a local file.
    const content: any = await readFile(credentialsPath);

    // Authorize a client with credentials
    return await authorize(JSON.parse(content), tokenName, noTokenInitialize);
  } catch (e) {
    console.error('Error on getOAuth2Client():', e);
    return null;
  }
};

// Create an OAuth2 client with the given credentials
const authorize = async (credentials: CredentialFileContent, tokenName: string, noTokenInitialize = false) => {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  let token;

  try {
    // Check if we have previously stored a token.
    token = JSON.parse(await readFile(getTokenPath(tokenName)) as any);
    oAuth2Client.setCredentials(token);
  } catch (e) {
    // Token file not found
    if (noTokenInitialize) {
      throw 'Token file not found!';
    }
    return await getNewToken(oAuth2Client, tokenName);
  }

  return oAuth2Client;
};

// Get and store new token after prompting for user authorization
const getNewToken = (oAuth2Client: OAuth2Client, tokenName: string) => new Promise<OAuth2Client>((resolve, reject) => {
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
      writeTokenFile(tokenName, token);
      return resolve(oAuth2Client);
    });
  });
});

const writeTokenFile = async (tokenName: string, token: Credentials) => {
  console.log('Writing token to file...');
  const tokenPath = getTokenPath(tokenName);

  // check if the directory exists
  const dir = `${tokenDirectoryName}`;

  try {
    try {
      await access(dir, constants.F_OK);
    } catch (e) {
      // if the directory doesn't exist, create it
      await mkdir(dir);
    }

    // write the token to the file
    await writeFile(tokenPath, JSON.stringify(token));
    console.log('Token stored to', tokenPath);
  } catch (e) {
    console.log(e);
  }
};

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
  #oAuth2Client: OAuth2Client | null = null;
  #account: string;
  #mailQueue: Mail[];
  #failedMails: FailedMail[];

  constructor(account: string) {
    this.#account = account;
    this.#mailQueue = [];
    this.#failedMails = [];
  }

  async initClient() {
    this.#oAuth2Client = await getOAuth2Client(this.#account, this.#account, true);
    if (this.#oAuth2Client) {
      this.#gmail = google.gmail({ version: 'v1', auth: this.#oAuth2Client });
    } else {
      console.error('Failed to initialize client');
    }
  }

  async sendMail(mail?: Mail) {
    if (!this.#gmail || !this.#oAuth2Client) {
      throw new Error('Client not initialized');
    }

    if (mail) this.#mailQueue.push(mail);

    // init gmail
    if (await refreshToken(this.#oAuth2Client, this.#account)) {
      this.#gmail = google.gmail({ version: 'v1', auth: this.#oAuth2Client });
    }

    let nMailSent = 0;
    for (const mail of this.#mailQueue) {
      const { from, to, subject, message, contentType = 'text/plain' } = mail;
      try {
        const result = await this.#gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: base64Encode(
              `From: ${from}\n` +
              `To: ${to}\n` +
              `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=\n` +
              'MIME-Version: 1.0\n' +
              `Content-Type: ${contentType}; charset=utf-8\n` + // text/plain, text/html
              '\n' +
              `${message}\n`
            ),
          },
        });
        if (result.data.id) {
          console.log(`Message sent with ID: ${result.data.id}`);
          nMailSent++;
        } else {
          throw {
            message: 'No message ID returned',
            result,
          }
        }
      } catch (err) {
        this.#failedMails.push({ ...mail, failReason: err as any, timestamp: Date.now() });
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
