const baseUrl = process.env.BASE_URL?.replace(/\/$/, '');
if (!baseUrl) throw new Error('BASE_URL is required');
if (
  !baseUrl.startsWith('https://') &&
  process.env.ALLOW_INSECURE_HTTP !== 'true'
) {
  throw new Error(
    'BASE_URL must use HTTPS (set ALLOW_INSECURE_HTTP=true only for a private test host)',
  );
}

async function check(path, validate) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  await validate(response);
  process.stdout.write(`ok ${path}\n`);
}

await check('/healthz', async (response) => {
  if ((await response.text()).trim() !== 'ok') {
    throw new Error('/healthz returned an unexpected body');
  }
});

await check('/api/health', async (response) => {
  const body = await response.json();
  if (body.status !== 'ok') {
    throw new Error(`/api/health is ${body.status ?? 'invalid'}`);
  }
  for (const dependency of ['postgres', 'redis', 'objectStorage']) {
    if (body.dependencies?.[dependency] !== 'up') {
      throw new Error(`${dependency} is not healthy`);
    }
  }
  if (!response.headers.get('x-request-id')) {
    throw new Error('/api/health did not return x-request-id');
  }
});

await check('/login', async (response) => {
  const requiredHeaders = [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
  ];
  for (const header of requiredHeaders) {
    if (!response.headers.get(header)) {
      throw new Error(`/login is missing ${header}`);
    }
  }
  const html = await response.text();
  if (!html.includes('商品套图 AI')) {
    throw new Error('/login did not return the application page');
  }
});

process.stdout.write('Production public smoke checks passed.\n');
