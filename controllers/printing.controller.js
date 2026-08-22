/**
 * Printing Controller — QZ Tray Security & Digital Signatures
 * Firma criptográfica RSA-SHA512 para habilitar impresión 100% silenciosa en QZ Tray
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const certPath = path.join(__dirname, '..', 'certs', 'digital-certificate.crt');
const keyPath = path.join(__dirname, '..', 'certs', 'digital-certificate.key');

exports.getCertificate = (req, res) => {
  try {
    if (fs.existsSync(certPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(fs.readFileSync(certPath, 'utf8'));
    }
    return res.status(404).send('Certificate not found');
  } catch (err) {
    return res.status(500).send(err.message);
  }
};

exports.signRequest = (req, res) => {
  try {
    let toSign = '';
    if (typeof req.body === 'string') {
      toSign = req.body;
    } else if (req.body && req.body.request) {
      toSign = req.body.request;
    } else if (req.body && req.body.data) {
      toSign = req.body.data;
    }

    if (!toSign) {
      return res.status(400).send('Request data to sign is required');
    }

    if (!fs.existsSync(keyPath)) {
      return res.status(500).send('Private key not found on server');
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const signer = crypto.createSign('SHA512');
    signer.update(toSign);
    signer.end();

    const signature = signer.sign(privateKey, 'base64');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(signature);
  } catch (err) {
    console.error('Error signing QZ request:', err);
    return res.status(500).send(err.message);
  }
};
