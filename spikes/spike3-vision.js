const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// dotenv can't parse multi-line unquoted JSON — extract the block manually
function loadVisionCreds() {
  const envPath = path.join(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const idx = raw.indexOf('GOOGLE_VISION_CREDENTIALS=');
  if (idx === -1) throw new Error('GOOGLE_VISION_CREDENTIALS not found in .env');
  const start = raw.indexOf('{', idx);
  let depth = 0, i = start;
  for (; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') { if (--depth === 0) break; }
  }
  return JSON.parse(raw.slice(start, i + 1));
}

const creds = loadVisionCreds();

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeJwt(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: creds.token_uri,
    iat: now,
    exp: now + 3600,
  })));
  const signing = `${header}.${payload}`;
  const sig = base64url(crypto.sign('sha256', Buffer.from(signing), { key: creds.private_key, format: 'pem' }));
  return `${signing}.${sig}`;
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postForm(url, params) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(params).toString();
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Obtaining access token...');
  const jwt = makeJwt(creds);
  const tokenRes = await postForm(creds.token_uri, {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  if (!tokenRes.access_token) {
    console.error('Token error:', tokenRes);
    process.exit(1);
  }
  console.log('Access token obtained.');

  const imagePath = path.join(__dirname, '..', 'assets', 'icon.png');
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  console.log(`Sending image: ${imagePath} (${Math.round(imageBase64.length * 0.75 / 1024)} KB)`);

  const visionUrl = 'https://vision.googleapis.com/v1/images:annotate';
  const res = await new Promise((resolve, reject) => {
    const body = JSON.stringify({
      requests: [{
        image: { content: imageBase64 },
        features: [{ type: 'LABEL_DETECTION', maxResults: 10 }],
      }],
    });
    const u = new URL(visionUrl);
    const req = https.request({
      hostname: u.hostname, path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${tokenRes.access_token}`,
      },
    }, r => {
      let raw = '';
      r.on('data', c => raw += c);
      r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log('\n--- Vision API response (status', res.status, ')---');
  if (res.body.responses?.[0]?.labelAnnotations) {
    console.log('Label annotations:');
    res.body.responses[0].labelAnnotations.forEach(l => {
      console.log(`  ${l.description.padEnd(30)} score=${l.score.toFixed(4)}`);
    });
  } else {
    console.log(JSON.stringify(res.body, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
