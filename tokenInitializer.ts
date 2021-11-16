import readline from 'readline';
import { getOAuth2Client } from './src/mailer';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// eslint-disable-next-line no-constant-condition
const prompt = () => {
  rl.question('Enter an account to initialize(Enter \'exit\' to exit): ', async input => {
    const account = input.trim();

    if (account) { 
      if (account === 'exit') {
        rl.close();
        return;
      }

      await getOAuth2Client(account, account);
      console.log(`Token for ${account} initialized.`);
    }

    prompt();
  });
};

prompt();

