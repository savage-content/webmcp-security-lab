import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const [command, toolName, rawArguments = '{}'] = process.argv.slice(2);
const connectorUrl = process.env.MCP_URL;

if (!connectorUrl) {
  throw new Error('MCP_URL is required.');
}

if (command !== 'list-tools' && command !== 'call') {
  throw new Error('Usage: live-mcp-call.mts list-tools | call <tool> [json]');
}

const client = new Client({
  name: 'leftout-live-verifier',
  version: '0.1.0',
});
const transport = new StreamableHTTPClientTransport(new URL(connectorUrl));

try {
  await client.connect(transport);
  const result =
    command === 'list-tools'
      ? await client.listTools()
      : await client.callTool({
          name: toolName ?? '',
          arguments: JSON.parse(rawArguments) as Record<string, unknown>,
        });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await transport.close();
}
