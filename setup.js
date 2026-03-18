const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('\n=== Media Server Setup ===\n');

  // 1. Database URL
  const defaultDb = 'postgresql://postgres:7710@localhost:5432/mediaserver';
  const dbUrl = (await ask(`Database URL [${defaultDb}]: `)).trim() || defaultDb;

  // 2. Create database if it doesn't exist
  console.log('\nCreating database if not exists...');
  const dbName = new URL(dbUrl).pathname.slice(1);
  const baseUrl = dbUrl.replace(`/${dbName}`, '/postgres');
  try {
    const { Pool } = require('pg');
    const tempPool = new Pool({ connectionString: baseUrl });
    const check = await tempPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1", [dbName]
    );
    if (check.rows.length === 0) {
      await tempPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database "${dbName}" created.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
    await tempPool.end();
  } catch (err) {
    console.error('Could not create database automatically:', err.message);
    console.log(`Please create the database manually: CREATE DATABASE ${dbName};`);
  }

  // 3. Run schema
  console.log('Initializing schema...');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: dbUrl });
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema initialized.');

  // 4. Admin user
  const username = (await ask('Admin username [admin]: ')).trim() || 'admin';
  const password = await ask('Admin password: ');
  if (!password) {
    console.error('Password cannot be empty.');
    process.exit(1);
  }

  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(password, 12);

  // Upsert admin user
  await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = $2, role = 'admin'`,
    [username, hash]
  );
  console.log(`Admin user "${username}" created.`);

  // 5. JWT Secret
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  // 6. Port and media dir
  const port = (await ask('Port [3000]: ')).trim() || '3000';
  const mediaDir = (await ask('Media directory [./media]: ')).trim() || './media';

  // 7. Self-signed SSL certificate
  const certsDir = path.join(__dirname, 'certs');
  if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

  const keyPath = path.join(certsDir, 'server.key');
  const certPath = path.join(certsDir, 'server.cert');

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('\nGenerating self-signed SSL certificate...');
    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=mediaserver"`,
        { stdio: 'pipe' }
      );
      console.log('SSL certificate generated.');
    } catch {
      console.log('openssl not found. Generating certificate with Node.js crypto...');
      // Fallback: generate using selfsigned-like approach with Node crypto
      const { generateKeyPairSync, createSign, createHash, X509Certificate } = require('crypto');
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      // Write a minimal self-signed cert using openssl-like subprocess
      // Since we can't easily create X509 in pure Node without openssl,
      // we'll write keys and tell user to install openssl or use HTTP
      fs.writeFileSync(keyPath, privateKey);
      console.log('WARNING: Could not generate certificate without openssl.');
      console.log('Install openssl and re-run setup, or the server will start in HTTP mode.');
    }
  } else {
    console.log('SSL certificate already exists, skipping generation.');
  }

  // 8. Write .env
  const envContent = `DB_URL=${dbUrl}
JWT_SECRET=${jwtSecret}
PORT=${port}
MEDIA_DIR=${mediaDir}
MAX_FILE_SIZE_MB=5120
MAX_FILES_PER_UPLOAD=500
JWT_EXPIRY=24h
SOFT_DELETE_DAYS=30
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  console.log('.env file written.');

  // 9. Create media directory
  const absMediaDir = path.resolve(__dirname, mediaDir);
  if (!fs.existsSync(absMediaDir)) {
    fs.mkdirSync(absMediaDir, { recursive: true });
    console.log(`Media directory created: ${absMediaDir}`);
  }

  // 10. Create thumbs directory
  const thumbsDir = path.join(__dirname, 'thumbs');
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  // 11. Download ffmpeg if not available
  console.log('\nChecking ffmpeg...');
  const { downloadFfmpeg } = require('./lib/ffmpeg');
  const ffmpegPath = await downloadFfmpeg();
  if (ffmpegPath) {
    console.log(`ffmpeg ready: ${ffmpegPath}`);
  } else {
    console.log('WARNING: ffmpeg not available. Video thumbnails will not work.');
    console.log('You can install ffmpeg manually later and restart the server.');
  }

  await pool.end();
  rl.close();
  console.log('\n=== Setup complete! Run "npm start" to start the server. ===\n');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
