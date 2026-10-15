const services = [
  ['web', process.env.WEB_HEALTH_URL ?? 'http://localhost:3000/api/health'],
  ['api', process.env.API_HEALTH_URL ?? 'http://localhost:3001/api/health'],
  ['worker', process.env.WORKER_HEALTH_URL ?? 'http://localhost:3002/health'],
  ['nginx', process.env.NGINX_HEALTH_URL ?? 'http://localhost:8080/api/health'],
];

let failed = false;

for (const [name, url] of services) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    if (!response.ok || body.status !== 'ok')
      throw new Error(JSON.stringify(body));
    console.log(`✓ ${name}: ${url}`);
  } catch (error) {
    failed = true;
    console.error(
      `✗ ${name}: ${url} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

if (failed) process.exit(1);
