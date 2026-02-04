/**
 * Abre o Firebase Console na página de métodos de login
 * para habilitar E-mail/senha (um clique em "Ativar").
 * Execute: node scripts/habilitar-email-senha.js
 */
const url = 'https://console.firebase.google.com/project/lovable2-e6f7f/authentication/providers';
const { exec } = require('child_process');
const platform = process.platform;
let cmd = '';
if (platform === 'win32') cmd = `start "" "${url}"`;
else if (platform === 'darwin') cmd = `open "${url}"`;
else cmd = `xdg-open "${url}"`;
exec(cmd, (err) => {
    if (err) {
        console.log('Abra no navegador:');
        console.log(url);
        return;
    }
    console.log('Abri o Firebase Console. Em "Provedores de login", clique em "E-mail/senha" e depois em "Ativar".');
});
