/*
 * Kagenti API Smoke Test
 *
 * Validates every API call the skill-marketplace plugin makes against a real
 * Kagenti cluster. Run with: npx tsx src/__fixtures__/kagenti-smoke.ts
 */

const API_URL = 'https://kagenti-api-kagenti-system.apps.ocp.v7hjl.sandbox2288.opentlc.com';
const KEYCLOAK_TOKEN_URL = 'https://keycloak-keycloak.apps.ocp.v7hjl.sandbox2288.opentlc.com/realms/kagenti/protocol/openid-connect/token';
const CLIENT_ID = 'kagenti';
const USERNAME = 'temp-admin';
const PASSWORD = '4454edeff4ee4470bdf29deb612e30c1';

interface SmokeResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
  responseShape?: Record<string, string>;
  rawData?: unknown;
}

const results: SmokeResult[] = [];

function log(label: string, ...args: unknown[]) {
  console.log(`\n${'='.repeat(70)}\n[${label}]`, ...args, '\n');
}

function recordShape(obj: unknown, prefix = ''): Record<string, string> {
  const shape: Record<string, string> = {};
  if (obj === null || obj === undefined) {
    shape[prefix || 'root'] = String(obj);
    return shape;
  }
  if (Array.isArray(obj)) {
    shape[prefix || 'root'] = `Array(${obj.length})`;
    if (obj.length > 0) {
      const childShape = recordShape(obj[0], `${prefix}[0]`);
      Object.assign(shape, childShape);
    }
    return shape;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v === null || v === undefined) {
        shape[key] = String(v);
      } else if (Array.isArray(v)) {
        shape[key] = `Array(${v.length})`;
        if (v.length > 0 && typeof v[0] === 'object') {
          Object.assign(shape, recordShape(v[0], `${key}[0]`));
        }
      } else if (typeof v === 'object') {
        Object.assign(shape, recordShape(v, key));
      } else {
        shape[key] = typeof v;
      }
    }
    return shape;
  }
  shape[prefix || 'root'] = typeof obj;
  return shape;
}

async function main() {
  // =====================================================================
  // 1a. Authenticate with Keycloak
  // =====================================================================
  log('1a', 'Authenticating with Keycloak...');
  let token = '';
  try {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      username: USERNAME,
      password: PASSWORD,
    });
    const res = await fetch(KEYCLOAK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      results.push({ test: '1a-keycloak-auth', status: 'FAIL', details: `HTTP ${res.status}: ${JSON.stringify(data)}` });
      console.error('Auth failed, cannot continue.');
      printSummary();
      return;
    }
    token = data.access_token as string;
    const expiresIn = data.expires_in as number;
    results.push({
      test: '1a-keycloak-auth',
      status: 'PASS',
      details: `Token obtained, expires_in=${expiresIn}s, token_type=${data.token_type}`,
      responseShape: recordShape(data),
    });
    console.log('Token obtained successfully.');
  } catch (err) {
    results.push({ test: '1a-keycloak-auth', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
    console.error('Auth failed, cannot continue.');
    printSummary();
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // =====================================================================
  // 1h. List namespaces
  // =====================================================================
  log('1h', 'Listing enabled namespaces...');
  let namespaces: string[] = [];
  try {
    const res = await fetch(`${API_URL}/api/v1/namespaces?enabled_only=true`, { headers });
    const data = await res.json() as Record<string, unknown>;
    results.push({
      test: '1h-list-namespaces',
      status: res.ok ? 'PASS' : 'FAIL',
      details: `HTTP ${res.status}`,
      responseShape: recordShape(data),
      rawData: data,
    });
    namespaces = (data.namespaces as string[]) || [];
    console.log('Namespaces:', namespaces);
  } catch (err) {
    results.push({ test: '1h-list-namespaces', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
  }

  // =====================================================================
  // 1b. List agents
  // =====================================================================
  log('1b', 'Listing agents...');
  let agents: Array<Record<string, unknown>> = [];
  const testNamespace = namespaces[0] || 'kagenti-system';
  try {
    const res = await fetch(`${API_URL}/api/v1/agents?namespace=${testNamespace}`, { headers });
    const data = await res.json() as Record<string, unknown>;
    results.push({
      test: '1b-list-agents',
      status: res.ok ? 'PASS' : 'FAIL',
      details: `HTTP ${res.status}, namespace=${testNamespace}`,
      responseShape: recordShape(data),
      rawData: data,
    });
    agents = ((data.items as Array<Record<string, unknown>>) || []);
    console.log(`Found ${agents.length} agents:`, agents.map(a => `${a.namespace}/${a.name} (${a.status})`));
  } catch (err) {
    results.push({ test: '1b-list-agents', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
  }

  if (agents.length === 0) {
    console.log('No agents found. Trying all namespaces...');
    for (const ns of namespaces) {
      try {
        const res = await fetch(`${API_URL}/api/v1/agents?namespace=${ns}`, { headers });
        const data = await res.json() as Record<string, unknown>;
        const items = (data.items as Array<Record<string, unknown>>) || [];
        if (items.length > 0) {
          agents = items;
          console.log(`Found ${items.length} agents in namespace ${ns}`);
          break;
        }
      } catch { /* continue */ }
    }
  }

  // =====================================================================
  // 1c. Get agent detail
  // =====================================================================
  const firstAgent = agents[0];
  if (firstAgent) {
    const agentNs = firstAgent.namespace as string;
    const agentName = firstAgent.name as string;

    log('1c', `Getting detail for ${agentNs}/${agentName}...`);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${agentNs}/${agentName}`, { headers });
      const data = await res.json() as Record<string, unknown>;
      results.push({
        test: '1c-agent-detail',
        status: res.ok ? 'PASS' : 'FAIL',
        details: `HTTP ${res.status}, agent=${agentNs}/${agentName}`,
        responseShape: recordShape(data),
        rawData: data,
      });
      console.log('Agent detail shape:', JSON.stringify(recordShape(data), null, 2));
      console.log('Full response (first 2000 chars):', JSON.stringify(data).slice(0, 2000));
    } catch (err) {
      results.push({ test: '1c-agent-detail', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
    }

    // =====================================================================
    // 1d. Get agent card
    // =====================================================================
    log('1d', `Getting agent card for ${agentNs}/${agentName}...`);
    let agentUrl = '';
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/${agentNs}/${agentName}/agent-card`, { headers });
      const data = await res.json() as Record<string, unknown>;
      agentUrl = (data.url as string) || '';
      results.push({
        test: '1d-agent-card',
        status: res.ok ? 'PASS' : 'FAIL',
        details: `HTTP ${res.status}, url=${agentUrl}, streaming=${data.streaming}`,
        responseShape: recordShape(data),
        rawData: data,
      });
      console.log('Agent card:', JSON.stringify(data, null, 2));
    } catch (err) {
      results.push({ test: '1d-agent-card', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
    }

    // =====================================================================
    // 1e. Send chat via Kagenti proxy
    // =====================================================================
    log('1e', `Sending chat via Kagenti proxy to ${agentNs}/${agentName}...`);
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/${agentNs}/${agentName}/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'Hello, what can you do?', session_id: null }),
      });
      const data = await res.json() as Record<string, unknown>;
      results.push({
        test: '1e-chat-proxy',
        status: res.ok ? 'PASS' : 'FAIL',
        details: `HTTP ${res.status}`,
        responseShape: recordShape(data),
        rawData: data,
      });
      console.log('Chat proxy response:', JSON.stringify(data, null, 2).slice(0, 2000));
    } catch (err) {
      results.push({ test: '1e-chat-proxy', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
    }

    // =====================================================================
    // 1f. Direct A2A call
    // =====================================================================
    if (agentUrl) {
      log('1f', `Direct A2A call to ${agentUrl}/a2a...`);
      try {
        const rpcPayload = {
          jsonrpc: '2.0',
          method: 'SendMessage',
          id: `smoke-${Date.now()}`,
          params: {
            message: {
              messageId: `msg-smoke-${Date.now()}`,
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          },
        };
        const res = await fetch(`${agentUrl}/a2a`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpcPayload),
          signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        results.push({
          test: '1f-direct-a2a',
          status: res.ok ? 'PASS' : 'FAIL',
          details: `HTTP ${res.status}, url=${agentUrl}/a2a`,
          responseShape: recordShape(data),
          rawData: data,
        });
        console.log('Direct A2A response:', JSON.stringify(data, null, 2).slice(0, 2000));
      } catch (err) {
        results.push({ test: '1f-direct-a2a', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
      }

      // Also try with Bearer token
      log('1f-auth', `Direct A2A call WITH Bearer token to ${agentUrl}/a2a...`);
      try {
        const rpcPayload = {
          jsonrpc: '2.0',
          method: 'SendMessage',
          id: `smoke-auth-${Date.now()}`,
          params: {
            message: {
              messageId: `msg-smoke-auth-${Date.now()}`,
              role: 'user',
              parts: [{ text: 'Hello with auth' }],
            },
          },
        };
        const res = await fetch(`${agentUrl}/a2a`, {
          method: 'POST',
          headers: { ...headers },
          body: JSON.stringify(rpcPayload),
          signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        results.push({
          test: '1f-direct-a2a-auth',
          status: res.ok ? 'PASS' : 'FAIL',
          details: `HTTP ${res.status}, url=${agentUrl}/a2a (with Bearer)`,
          responseShape: recordShape(data),
          rawData: typeof data === 'object' && data !== null ? JSON.stringify(data).slice(0, 500) : data,
        });
      } catch (err) {
        results.push({ test: '1f-direct-a2a-auth', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
      }
    } else {
      results.push({ test: '1f-direct-a2a', status: 'SKIP', details: 'No agent URL from agent card' });
    }

    // =====================================================================
    // 1g. Stream chat
    // =====================================================================
    log('1g', `Streaming chat to ${agentNs}/${agentName}...`);
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/${agentNs}/${agentName}/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'Hello, briefly describe yourself' }),
        signal: AbortSignal.timeout(30_000),
      });
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      results.push({
        test: '1g-stream-chat',
        status: res.ok ? 'PASS' : 'FAIL',
        details: `HTTP ${res.status}, content-type=${contentType}, body_length=${text.length}`,
        rawData: text.slice(0, 2000),
      });
      console.log('Stream response (first 2000 chars):', text.slice(0, 2000));
    } catch (err) {
      results.push({ test: '1g-stream-chat', status: 'FAIL', details: `Exception: ${(err as Error).message}` });
    }

    // =====================================================================
    // Check origin match
    // =====================================================================
    if (agentUrl) {
      const apiOrigin = new URL(API_URL).origin;
      const agentOrigin = new URL(agentUrl).origin;
      const originMatch = apiOrigin === agentOrigin;
      results.push({
        test: 'origin-check',
        status: originMatch ? 'PASS' : 'FAIL',
        details: `API origin=${apiOrigin}, agent origin=${agentOrigin}, match=${originMatch}`,
      });
    }
  } else {
    const skipTests = ['1c-agent-detail', '1d-agent-card', '1e-chat-proxy', '1f-direct-a2a', '1g-stream-chat'];
    for (const t of skipTests) {
      results.push({ test: t, status: 'SKIP', details: 'No agents found in any namespace' });
    }
  }

  printSummary();
}

function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('KAGENTI SMOKE TEST SUMMARY');
  console.log('='.repeat(70));

  for (const r of results) {
    const icon = r.status === 'PASS' ? 'OK' : r.status === 'FAIL' ? 'FAIL' : 'SKIP';
    console.log(`[${icon}] ${r.test}: ${r.details}`);
    if (r.responseShape) {
      console.log('     Response shape:');
      for (const [k, v] of Object.entries(r.responseShape)) {
        console.log(`       ${k}: ${v}`);
      }
    }
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  console.log(`\nTotal: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  console.log('\n' + '='.repeat(70));
  console.log('DETAILED RAW RESPONSES');
  console.log('='.repeat(70));
  for (const r of results) {
    if (r.rawData) {
      console.log(`\n--- ${r.test} ---`);
      console.log(typeof r.rawData === 'string' ? r.rawData : JSON.stringify(r.rawData, null, 2));
    }
  }
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
