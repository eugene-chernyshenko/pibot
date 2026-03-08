/**
 * JSON-RPC 2.0 message types for MCP protocol
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number | string;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  error: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// MCP-specific methods
export const MCP_METHODS = {
  // Lifecycle
  INITIALIZE: 'initialize',
  INITIALIZED: 'notifications/initialized',
  SHUTDOWN: 'shutdown',

  // Tools
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',

  // Resources
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',

  // Notifications (server -> client)
  TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',
  RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',
} as const;

// MCP protocol version
export const MCP_PROTOCOL_VERSION = '2024-11-05';

// Helper to check if response is an error
export function isJsonRpcError(response: JsonRpcResponse): response is JsonRpcErrorResponse {
  return 'error' in response;
}

// Helper to create a request
export function createRequest(
  id: number | string,
  method: string,
  params?: Record<string, unknown>
): JsonRpcRequest {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
  };
  if (params) {
    request.params = params;
  }
  return request;
}

// Helper to create a notification
export function createNotification(
  method: string,
  params?: Record<string, unknown>
): JsonRpcNotification {
  const notification: JsonRpcNotification = {
    jsonrpc: '2.0',
    method,
  };
  if (params) {
    notification.params = params;
  }
  return notification;
}
