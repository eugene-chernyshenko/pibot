import { BaseTool, type ToolResult } from '../src/tools/BaseTool.js';
import type { Tool } from '../src/llm/types.js';

export class UrlFetcherTool extends BaseTool {
  readonly name = 'url_fetcher';
  readonly description = 'Tool for fetching data from URLs via HTTP requests';

  getTools(): Tool[] {
    return [
      {
        name: 'fetch_url',
        description: 'Fetch content from a URL. Returns response body as text or JSON.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch',
            },
            method: {
              type: 'string',
              description: 'HTTP method (GET, POST, PUT, DELETE, PATCH)',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            },
            body: {
              type: 'string',
              description: 'Request body (for POST, PUT, PATCH)',
            },
            headers: {
              type: 'object',
              description: 'Request headers as key-value pairs',
            },
            timeout: {
              type: 'number',
              description: 'Request timeout in milliseconds (default: 30000)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'fetch_json',
        description: 'Fetch JSON data from a URL. Automatically parses response as JSON.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch JSON from',
            },
            method: {
              type: 'string',
              description: 'HTTP method',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            },
            body: {
              type: 'object',
              description: 'Request body (will be JSON stringified)',
            },
            headers: {
              type: 'object',
              description: 'Additional request headers',
            },
          },
          required: ['url'],
        },
      },
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'fetch_url':
        return this.fetchUrl(params);
      case 'fetch_json':
        return this.fetchJson(params);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async fetchUrl(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = params['url'] as string;
      const method = (params['method'] as string) || 'GET';
      const body = params['body'] as string | undefined;
      const headers = params['headers'] as Record<string, string> | undefined;
      const timeout = (params['timeout'] as number) || 30000;

      if (!url) {
        return this.error('URL is required');
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        return this.error(`Invalid URL: ${url}`);
      }

      this.logger.debug({ url, method }, 'Fetching URL');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method,
          body: body,
          headers: {
            'User-Agent': 'PiBot/1.0',
            ...headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        let responseBody: string;

        if (contentType.includes('application/json')) {
          const json = await response.json();
          responseBody = JSON.stringify(json, null, 2);
        } else {
          responseBody = await response.text();
        }

        // Truncate very long responses
        const maxLength = 50000;
        if (responseBody.length > maxLength) {
          responseBody = responseBody.substring(0, maxLength) + '\n... [truncated]';
        }

        if (!response.ok) {
          return this.error(
            `HTTP ${response.status} ${response.statusText}\n${responseBody}`
          );
        }

        return this.success({
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: responseBody,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.error('Request timeout');
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error }, 'Fetch failed');
      return this.error(`Fetch failed: ${message}`);
    }
  }

  private async fetchJson(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = params['url'] as string;
      const method = (params['method'] as string) || 'GET';
      const body = params['body'] as object | undefined;
      const headers = params['headers'] as Record<string, string> | undefined;

      if (!url) {
        return this.error('URL is required');
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        return this.error(`Invalid URL: ${url}`);
      }

      this.logger.debug({ url, method }, 'Fetching JSON');

      const response = await fetch(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          'User-Agent': 'PiBot/1.0',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return this.error(
          `HTTP ${response.status} ${response.statusText}\n${errorBody}`
        );
      }

      const json = await response.json();

      return this.success(JSON.stringify(json, null, 2));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error }, 'Fetch JSON failed');
      return this.error(`Fetch JSON failed: ${message}`);
    }
  }
}

// Export for dynamic loading
export default UrlFetcherTool;
