/**
 * MCP-specific error classes
 */

export class MCPError extends Error {
  constructor(
    message: string,
    public readonly serverName?: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class MCPConnectionError extends MCPError {
  constructor(serverName: string, message: string, cause?: Error) {
    super(`Connection to '${serverName}' failed: ${message}`, serverName);
    this.name = 'MCPConnectionError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class MCPTimeoutError extends MCPError {
  constructor(serverName: string, operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' on '${serverName}' timed out after ${timeoutMs}ms`,
      serverName
    );
    this.name = 'MCPTimeoutError';
  }
}

export class MCPProtocolError extends MCPError {
  constructor(serverName: string, message: string, code?: number) {
    super(`Protocol error from '${serverName}': ${message}`, serverName, code);
    this.name = 'MCPProtocolError';
  }
}

export class MCPToolError extends MCPError {
  constructor(
    serverName: string,
    toolName: string,
    message: string
  ) {
    super(`Tool '${toolName}' on '${serverName}' failed: ${message}`, serverName);
    this.name = 'MCPToolError';
  }
}

export class MCPConfigError extends MCPError {
  constructor(message: string) {
    super(message);
    this.name = 'MCPConfigError';
  }
}
