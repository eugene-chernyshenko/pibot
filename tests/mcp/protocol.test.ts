import { describe, it, expect } from 'vitest';
import {
  createRequest,
  createNotification,
  isJsonRpcError,
  MCP_METHODS,
  MCP_PROTOCOL_VERSION,
  JSON_RPC_ERRORS,
} from '../../src/mcp/protocol/messages.js';

describe('JSON-RPC Messages', () => {
  describe('createRequest', () => {
    it('should create request with id and method', () => {
      const request = createRequest(1, 'test/method');

      expect(request.jsonrpc).toBe('2.0');
      expect(request.id).toBe(1);
      expect(request.method).toBe('test/method');
      expect(request.params).toBeUndefined();
    });

    it('should create request with params', () => {
      const request = createRequest(2, 'test/method', { foo: 'bar' });

      expect(request.params).toEqual({ foo: 'bar' });
    });

    it('should handle string id', () => {
      const request = createRequest('uuid-123', 'test/method');

      expect(request.id).toBe('uuid-123');
    });
  });

  describe('createNotification', () => {
    it('should create notification without id', () => {
      const notification = createNotification('test/notify');

      expect(notification.jsonrpc).toBe('2.0');
      expect(notification.method).toBe('test/notify');
      expect('id' in notification).toBe(false);
    });

    it('should create notification with params', () => {
      const notification = createNotification('test/notify', { data: 123 });

      expect(notification.params).toEqual({ data: 123 });
    });
  });

  describe('isJsonRpcError', () => {
    it('should identify error response', () => {
      const errorResponse = {
        jsonrpc: '2.0' as const,
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };

      expect(isJsonRpcError(errorResponse)).toBe(true);
    });

    it('should identify success response', () => {
      const successResponse = {
        jsonrpc: '2.0' as const,
        id: 1,
        result: { data: 'success' },
      };

      expect(isJsonRpcError(successResponse)).toBe(false);
    });
  });

  describe('MCP Constants', () => {
    it('should have correct protocol version', () => {
      expect(MCP_PROTOCOL_VERSION).toBe('2024-11-05');
    });

    it('should have all required methods', () => {
      expect(MCP_METHODS.INITIALIZE).toBe('initialize');
      expect(MCP_METHODS.INITIALIZED).toBe('notifications/initialized');
      expect(MCP_METHODS.TOOLS_LIST).toBe('tools/list');
      expect(MCP_METHODS.TOOLS_CALL).toBe('tools/call');
      expect(MCP_METHODS.RESOURCES_LIST).toBe('resources/list');
      expect(MCP_METHODS.RESOURCES_READ).toBe('resources/read');
    });

    it('should have standard error codes', () => {
      expect(JSON_RPC_ERRORS.PARSE_ERROR).toBe(-32700);
      expect(JSON_RPC_ERRORS.INVALID_REQUEST).toBe(-32600);
      expect(JSON_RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
      expect(JSON_RPC_ERRORS.INVALID_PARAMS).toBe(-32602);
      expect(JSON_RPC_ERRORS.INTERNAL_ERROR).toBe(-32603);
    });
  });
});
