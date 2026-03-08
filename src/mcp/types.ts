/**
 * MCP (Model Context Protocol) type definitions
 * Based on the MCP specification from Anthropic
 */

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number; // Connection timeout in ms, default 30000
  retries?: number; // Max reconnection attempts, default 3
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPToolInputSchema {
  type: 'object';
  properties?: Record<string, MCPToolProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface MCPToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: MCPToolProperty;
  properties?: Record<string, MCPToolProperty>;
  required?: string[];
  default?: unknown;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion?: string;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPServerInfo;
}

export interface MCPToolCallResult {
  content: MCPToolContent[];
  isError?: boolean;
}

export interface MCPToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string; // base64 for images
  mimeType?: string;
  resource?: MCPResourceContent;
}

export type MCPConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'closed';

export interface MCPConnectionStatus {
  serverName: string;
  state: MCPConnectionState;
  error?: string | undefined;
  toolCount?: number | undefined;
  resourceCount?: number | undefined;
  connectedAt?: Date | undefined;
}
