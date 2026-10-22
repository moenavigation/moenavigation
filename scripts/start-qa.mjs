import nextEnv from '@next/env';
import { spawn } from 'node:child_process';
nextEnv.loadEnvConfig(process.cwd());
const production = process.argv.includes('--production');
const qaEnv = { ...process.env, MONGODB_DB_NAME: `${process.env.MONGODB_DB_NAME}_qa_backend`, CLOUDINARY_FOLDER: 'moe-navigation-qa', NEXT_PUBLIC_SITE_URL: 'http://localhost:3006', NEXT_DIST_DIR: production ? '.next' : '.next-qa', RESEND_API_KEY: '', ENQUIRY_EMAIL_FROM: '', ENQUIRY_EMAIL_TO: '' };
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', production ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', '3006'], { env: qaEnv, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code || 0; });
