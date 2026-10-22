import nextEnv from '@next/env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());
const qa = process.argv.includes('--qa');
if (qa) {
  process.env.MONGODB_DB_NAME = `${process.env.MONGODB_DB_NAME}_qa_backend`;
  process.env.CLOUDINARY_FOLDER = 'moe-navigation-qa';
}
const { collections, getClient, getDb, ensureIndexes } = await import('../src/server/db');
const { hashPassword } = await import('../src/server/auth');
try {
  await ensureIndexes();
  const c = collections(await getDb());
  if (!await c.users.countDocuments()) {
    const username = 'admin';
    let password = randomBytes(24).toString('base64url');
    await mkdir('.local', { recursive: true });
    const path = qa ? '.local/cms-access.qa.json' : '.local/cms-access.json';
    // Write the access file before creating the account so a filesystem failure cannot lock out the owner.
    try { await writeFile(path, JSON.stringify({ username, password }, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Resume an interrupted first setup using its already-written local credentials.
      const previous = JSON.parse(await readFile(path, 'utf8'));
      if (previous.username !== username || typeof previous.password !== 'string' || previous.password.length < 14) throw new Error('InvalidLocalAccessFile');
      password = previous.password;
    }
    await c.users.insertOne({ _id: randomUUID(), username, passwordHash: await hashPassword(password), passwordVersion: 1, createdAt: new Date() });
    console.log(`CMS admin created. Initial credentials are in ${path}. Change the password in Account after signing in.`);
  } else console.log('Existing CMS account preserved.');
  console.log(JSON.stringify({ setup: 'complete', mode: qa ? 'isolated-qa' : 'project', contentRecords: await c.content.countDocuments() }));
  if (!await c.content.countDocuments()) console.log('The content database is empty. Run backend:migrate to review the website migration, then apply its reviewed plan.');
} catch (error) { console.error('Setup failed:', error instanceof Error ? error.name : 'UnknownError'); process.exitCode = 1; }
finally { await getClient().then(client => client.close()).catch(() => {}); }
