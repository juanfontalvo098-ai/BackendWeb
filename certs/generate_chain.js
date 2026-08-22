const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.resolve(__dirname);
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

const openssl = '"C:\\Program Files\\Git\\usr\\bin\\openssl.exe"';

console.log('1. Generando Root CA (Autoridad Raíz)...');
execSync(`${openssl} genrsa -out "${path.join(certDir, 'root-ca.key')}" 2048`);

const rootCnf = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
C = CO
O = KAMIA Industries LLC
CN = KAMIA GastrosPOS Root CA

[v3_ca]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
`;
fs.writeFileSync(path.join(certDir, 'root-ca.cnf'), rootCnf);
execSync(`${openssl} req -x509 -new -nodes -key "${path.join(certDir, 'root-ca.key')}" -sha512 -days 7300 -out "${path.join(certDir, 'root-ca.crt')}" -config "${path.join(certDir, 'root-ca.cnf')}"`);

console.log('2. Generando Certificado Digital (Leaf) y CSR...');
execSync(`${openssl} genrsa -out "${path.join(certDir, 'leaf.key')}" 2048`);

const leafCnf = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = CO
O = KAMIA by JF
CN = KAMIA GastrosPOS Printing System

[v3_req]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
`;
fs.writeFileSync(path.join(certDir, 'leaf.cnf'), leafCnf);
execSync(`${openssl} req -new -key "${path.join(certDir, 'leaf.key')}" -out "${path.join(certDir, 'leaf.csr')}" -config "${path.join(certDir, 'leaf.cnf')}"`);

console.log('3. Firmando Certificado Digital con Root CA...');
const extCnf = `basicConstraints = CA:FALSE
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
keyUsage = critical, digitalSignature, keyEncipherment
`;
fs.writeFileSync(path.join(certDir, 'ext.cnf'), extCnf);
execSync(`${openssl} x509 -req -in "${path.join(certDir, 'leaf.csr')}" -CA "${path.join(certDir, 'root-ca.crt')}" -CAkey "${path.join(certDir, 'root-ca.key')}" -CAcreateserial -out "${path.join(certDir, 'leaf.crt')}" -days 7300 -sha512 -extfile "${path.join(certDir, 'ext.cnf')}"`);

console.log('4. Convirtiendo clave privada a PKCS#8...');
execSync(`${openssl} pkcs8 -topk8 -inform PEM -outform PEM -in "${path.join(certDir, 'leaf.key')}" -out "${path.join(certDir, 'leaf.pkcs8.key')}" -nocrypt`);

console.log('5. Verificando cadena criptográfica...');
const verifyOut = execSync(`${openssl} verify -CAfile "${path.join(certDir, 'root-ca.crt')}" "${path.join(certDir, 'leaf.crt')}"`).toString();
console.log('Verificación OpenSSL:', verifyOut.trim());

console.log('\n--- ROOT CA (Para override.crt de QZ Tray) ---');
console.log(fs.readFileSync(path.join(certDir, 'root-ca.crt'), 'utf8'));

console.log('\n--- LEAF CRT (Para el Frontend GastrosPOS) ---');
console.log(fs.readFileSync(path.join(certDir, 'leaf.crt'), 'utf8'));

console.log('\n--- LEAF KEY (Para firma digital del Frontend) ---');
console.log(fs.readFileSync(path.join(certDir, 'leaf.pkcs8.key'), 'utf8'));
