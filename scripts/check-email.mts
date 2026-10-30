import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { emailSetupStatus } = await import('../src/server/enquiry-notifications');
const setup = emailSetupStatus();
const serverSettingsAdded = setup.checks.apiKey === 'added' && setup.checks.sender === 'added';

// Local configuration validation only: no provider call, database connection,
// email address, API key or secret fingerprint is included in the result.
console.log(JSON.stringify({ provider: setup.provider, serverSettingsAdded, checks: { apiKey: setup.checks.apiKey, sender: setup.checks.sender }, recipients: 'Manage and check in CMS Enquiries', providerVerification: 'not_checked', emailSent: false }, null, 2));
process.exitCode = serverSettingsAdded ? 0 : 1;
