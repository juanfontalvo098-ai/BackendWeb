const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootCrt = fs.readFileSync(path.join(__dirname, 'root-ca.crt'));
const leafCrt = fs.readFileSync(path.join(__dirname, 'leaf.crt'));

const dests = [
  process.env.APPDATA + '\\qz\\override.crt',
  process.env.APPDATA + '\\qz\\authcert.pem',
  process.env.USERPROFILE + '\\.qz\\override.crt',
  process.env.USERPROFILE + '\\.qz\\authcert.pem'
];

dests.forEach(d => {
  try {
    fs.writeFileSync(d, rootCrt);
    console.log('✅ Escrito Root CA en:', d);
  } catch(e) {
    console.warn('⚠️ No se pudo escribir en', d, e.message);
  }
});

const qzConsole = 'C:\\Program Files\\QZ Tray\\qz-tray-console.exe';
if (fs.existsSync(qzConsole)) {
  const rootPath = path.join(__dirname, 'root-ca.crt');
  const leafPath = path.join(__dirname, 'leaf.crt');
  execSync(`"${qzConsole}" --whitelist "${rootPath}"`);
  execSync(`"${qzConsole}" --whitelist "${leafPath}"`);
  console.log('✅ Whitelist ejecutado con éxito en QZ Tray Console');
}
