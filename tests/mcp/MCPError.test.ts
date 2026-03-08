import { describe, it, expect } from 'vitest';
import {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPToolError,
  MCPConfigError,
} from '../../src/mcp/MCPError.js';

describe('MCP Errors', () => {
  describe('MCPError', () => {
    it('should create base error with message', () => {
      const error = new MCPError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('MCPError');
      expect(error.serverName).toBeUndefined();
    });

    it('should create error with server name', () => {
      const error = new MCPError('Test error', 'figma');

      expect(error.serverName).toBe('figma');
    });

    it('should create error with code', () => {
      const error = new MCPError('Test error', 'figma', -32600);

      expect(error.code).toBe(-32600);
    });
  });

  describe('MCPConnectionError', () => {
    it('should include server name in message', () => {
      const error = new MCPConnectionError('figma', 'Connection refused');

      expect(error.message).toContain('figma');
      expect(error.message).toContain('Connection refused');
      expect(error.name).toBe('MCPConnectionError');
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new MCPConnectionError('figma', 'Failed', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('MCPTimeoutError', () => {
    it('should include operation and timeout in message', () => {
      const error = new MCPTimeoutError('figma', 'tools/call', 30000);

      expect(error.message).toContain('figma');
      expect(error.message).toContain('tools/call');
      expect(error.message).toContain('30000ms');
      expect(error.name).toBe('MCPTimeoutError');
    });
  });

  describe('MCPProtocolError', () => {
    it('should include error code', () => {
      const error = new MCPProtocolError('figma', 'Invalid params', -32602);

      expect(error.message).toContain('figma');
      expect(error.message).toContain('Invalid params');
      expect(error.code).toBe(-32602);
      expect(error.name).toBe('MCPProtocolError');
    });
  });

  describe('MCPToolError', () => {
    it('should include tool name', () => {
      const error = new MCPToolError('figma', 'get_screenshot', 'Invalid node ID');

      expect(error.message).toContain('figma');
      expect(error.message).toContain('get_screenshot');
      expect(error.message).toContain('Invalid node ID');
      expect(error.name).toBe('MCPToolError');
    });
  });

  describe('MCPConfigError', () => {
    it('should create config error', () => {
      const error = new MCPConfigError('Invalid config format');

      expect(error.message).toBe('Invalid config format');
      expect(error.name).toBe('MCPConfigError');
      expect(error.serverName).toBeUndefined();
    });
  });

  describe('Error hierarchy', () => {
    it('should be instances of Error', () => {
      expect(new MCPError('test')).toBeInstanceOf(Error);
      expect(new MCPConnectionError('s', 'm')).toBeInstanceOf(Error);
      expect(new MCPTimeoutError('s', 'o', 1000)).toBeInstanceOf(Error);
      expect(new MCPProtocolError('s', 'm')).toBeInstanceOf(Error);
      expect(new MCPToolError('s', 't', 'm')).toBeInstanceOf(Error);
      expect(new MCPConfigError('m')).toBeInstanceOf(Error);
    });

    it('should be instances of MCPError', () => {
      expect(new MCPConnectionError('s', 'm')).toBeInstanceOf(MCPError);
      expect(new MCPTimeoutError('s', 'o', 1000)).toBeInstanceOf(MCPError);
      expect(new MCPProtocolError('s', 'm')).toBeInstanceOf(MCPError);
      expect(new MCPToolError('s', 't', 'm')).toBeInstanceOf(MCPError);
      expect(new MCPConfigError('m')).toBeInstanceOf(MCPError);
    });
  });
});
