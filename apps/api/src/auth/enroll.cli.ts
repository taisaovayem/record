import { loadAuthConfig } from './auth-config.js';

async function main(): Promise<void> {
  const config = loadAuthConfig();
  const port = Number(process.env.PORT ?? 3000);
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/enrollments/issue`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.enrollmentSecret}` },
  });
  if (!response.ok) throw new Error(`Could not authorize passkey enrollment (HTTP ${response.status}); is the API running?`);
  const body = await response.json() as { token?: unknown };
  if (typeof body.token !== 'string') throw new Error('The API returned an invalid enrollment authorization');
  const url = new URL('/enroll', config.origin);
  url.hash = body.token;
  process.stdout.write(`Open this URL to register a passkey (expires in 10 minutes):\n${url.toString()}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Could not create enrollment authorization'}\n`);
  process.exitCode = 1;
});
