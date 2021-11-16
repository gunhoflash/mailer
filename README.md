# Mailer
Send emails using Gmail API

## Before Start
1. Place your credential file in `credentials` folder with name `credentials.{{account}}.json`.
2. Create `.env` file in `config` folder.
   - You can set value of HTTP_PORT and HTTPS_PORT.
3. (Optional) Edit the `whitelist.json` file to config CORS.
4. Run `npm run i` or `npm run ci`.
5. Run `npm run init`.
   - Enter the account name to create an token file.
   - Token file will be created in `token` folder.

## Run Mailer
Just run `npm start`.