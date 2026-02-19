/**
 * TLS 인증서 생성 - certs/key.pem, cert.pem (OpenSSL 불필요)
 */
const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const CERTS_DIR = path.join(__dirname, '..', 'certs');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');

if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
}

const networkInterfaces = require('os').networkInterfaces();
let localIp = '127.0.0.1';
for (const iface of Object.values(networkInterfaces)) {
  for (const info of iface) {
    if (info.family === 'IPv4' && !info.internal) {
      localIp = info.address;
      break;
    }
  }
}

async function main() {
  const attrs = [{ name: 'commonName', value: localIp }];
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 1);
  const opts = {
    notAfterDate: notAfter,
    keySize: 2048,
    extensions: [{
      name: 'subjectAltName',
      altNames: [
        { type: 7, ip: localIp },
        { type: 7, ip: '127.0.0.1' },
        { type: 2, value: 'localhost' },
      ],
    }],
  };

  const pems = await selfsigned.generate(attrs, opts);
  fs.writeFileSync(KEY_PATH, pems.private);
  fs.writeFileSync(CERT_PATH, pems.cert);

  console.log('\n인증서 생성 완료:', CERTS_DIR);
  console.log('  key.pem, cert.pem');
  console.log('  (OpenSSL 미사용 - Node.js로 생성됨)\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
