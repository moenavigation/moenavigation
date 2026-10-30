import nextEnv from '@next/env';
import { randomUUID } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd());
const { collections, getClient, getDb, transaction } = await import('../src/server/db');
const { hashPassword, verifyPassword } = await import('../src/server/auth');

function readPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = '';
    const terminal = process.stdin.isTTY;
    if (terminal) process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    function finish(error?: Error) {
      process.stdin.off('data', receive);
      process.stdin.off('end', ended);
      if (terminal) process.stdin.setRawMode(false);
      process.stdin.pause();
      if (error) reject(error);
      else resolve(input.split(/[\r\n]/, 1)[0]);
      input = '';
    }
    function receive(chunk: string) {
      if (chunk.includes('\u0003')) return finish(new Error('Password entry cancelled.'));
      input += chunk;
      if (input.length > 202) return finish(new Error('Password must contain 14–200 characters.'));
      if (/[\r\n]/.test(input)) finish();
    }
    function ended() { finish(new Error('Password input ended before a complete line was received.')); }
    process.stdin.on('data', receive);
    process.stdin.once('end', ended);
    process.stdin.resume();
    console.log('Enter the requested Dev password. Input is hidden and is not stored in a file.');
  });
}

try {
  if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Only --check is supported.');
  const c = collections(await getDb());
  if (process.argv.includes('--check')) {
    const existing = await c.users.findOne({ username: 'dev' }, { projection: { role: 1 } });
    console.log(JSON.stringify({ database: process.env.MONGODB_DB_NAME, username: 'dev', exists: Boolean(existing), role: existing?.role ?? null }));
  } else {
    const password = await readPassword();
    if (password.length < 14 || password.length > 200) throw new Error('Password must contain 14–200 characters.');
    const passwordHash = await hashPassword(password);
    const created = await transaction(async (db, session) => {
      const scoped = collections(db);
      await scoped.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
      const existing = await scoped.users.findOne({ username: 'dev' }, { session });
      if (existing) {
        if (existing.role !== 'Dev' || !await verifyPassword(password, existing.passwordHash)) throw new Error('The dev username already exists with different access. No account was changed.');
        return false;
      }
      await scoped.users.insertOne({ _id: randomUUID(), username: 'dev', role: 'Dev', passwordHash, passwordVersion: 1, createdAt: new Date() }, { session });
      return true;
    });
    const saved = await c.users.findOne({ username: 'dev' });
    if (saved?.role !== 'Dev' || !await verifyPassword(password, saved.passwordHash)) throw new Error('Account verification failed.');
    console.log(JSON.stringify({ database: process.env.MONGODB_DB_NAME, username: 'dev', role: 'Dev', created, passwordVerified: true }));
  }
} catch (error) {
  const safeMessages = ['Only --check is supported.', 'Password entry cancelled.', 'Password must contain 14–200 characters.', 'Password input ended before a complete line was received.', 'The dev username already exists with different access. No account was changed.', 'Account verification failed.'];
  console.error(error instanceof Error && safeMessages.includes(error.message) ? error.message : 'Dev account provisioning failed. No credentials were logged.');
  process.exitCode = 1;
} finally {
  await getClient().then(client => client.close()).catch(() => {});
}
