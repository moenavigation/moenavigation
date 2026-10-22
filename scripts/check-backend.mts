import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { getClient, getDb } = await import('../src/server/db');
const { mediaProvider } = await import('../src/server/media');
try {
  const db = await getDb();
  await db.command({ ping: 1 });
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name);
  const owned = names.filter(name => name.startsWith('moe_'));
  console.log(JSON.stringify({ mongodb: 'connected', existingProjectCollections: owned }));
  await mediaProvider().api.ping();
  console.log(JSON.stringify({ cloudinary: 'connected' }));
} catch (error) {
  console.error('Backend connection check failed:', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally { await getClient().then(client => client.close()).catch(() => {}); }
