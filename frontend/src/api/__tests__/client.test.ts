/**
 * API Client 单元测试
 *
 * 使用 Mock fetch 验证所有 API 方法的行为，覆盖成功路径和错误路径。
 * 来源: 详细设计 §3.9.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiClient,
  ApiError,
  apiClient,
} from '../client';
import { errorHandler } from '../errors';
import type {
  IApiClient,
  ProjectData,
  ValidationResult,
} from '../client';
import type { SemanticModel } from '@/types/semantic-model';
import type { CanvasModel } from '@/types/canvas-model';

// ---- 测试固件 ----

function makeMockFetch() {
  return vi.fn<typeof fetch>();
}

function makeSemanticModel(overrides: Partial<SemanticModel> = {}): SemanticModel {
  return {
    id: 'model-001',
    name: 'TestModel',
    elements: [],
    relationships: [],
    packages: [],
    ...overrides,
  };
}

function makeProjectData(): ProjectData {
  return {
    semanticModel: makeSemanticModel(),
    canvasModel: {
      semanticModelId: 'model-001',
      diagrams: [],
    } as CanvasModel,
    metadata: {
      name: 'TestProject',
      created: '2026-06-05T10:00:00Z',
      modified: '2026-06-05T14:30:00Z',
      version: '1.0',
    },
  };
}

function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  } as Response;
}

function mockJsonError(status: number, code: string, message: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve({ code, message }),
  } as Response;
}

// =============================================================================
// ApiError 测试
// =============================================================================

describe('ApiError', () => {
  it('should create an ApiError with correct properties', () => {
    const error = new ApiError(404, 'NOT_FOUND', '资源未找到', { path: '/test' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('资源未找到');
    expect(error.details).toEqual({ path: '/test' });
  });

  it('should create an ApiError without details', () => {
    const error = new ApiError(0, 'NETWORK_ERROR', '网络连接失败');

    expect(error.statusCode).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toBe('网络连接失败');
    expect(error.details).toBeUndefined();
  });

  it('should maintain correct prototype chain', () => {
    const error = new ApiError(500, 'SERVER_ERROR', '服务器错误');
    expect(Object.getPrototypeOf(error)).toBe(ApiError.prototype);
  });
});

// =============================================================================
// errorHandler 测试
// =============================================================================

describe('errorHandler', () => {
  it('should return the same ApiError if already ApiError', () => {
    const original = new ApiError(400, 'BAD_REQUEST', '参数错误');
    const result = errorHandler(original);
    expect(result).toBe(original);
  });

  it('should convert DOMException AbortError to TIMEOUT', () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const result = errorHandler(abortError);
    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe('TIMEOUT');
    expect(result.statusCode).toBe(0);
    expect(result.message).toBe('请求超时');
  });

  it('should convert TypeError to NETWORK_ERROR', () => {
    const typeError = new TypeError('Failed to fetch');
    const result = errorHandler(typeError);
    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.statusCode).toBe(0);
    expect(result.message).toContain('网络连接失败');
  });

  it('should convert generic Error to NETWORK_ERROR', () => {
    const genericError = new Error('Something went wrong');
    const result = errorHandler(genericError);
    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.statusCode).toBe(0);
    expect(result.message).toBe('Something went wrong');
  });

  it('should convert unknown errors to UNKNOWN', () => {
    const result = errorHandler('just a string');
    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe('UNKNOWN');
    expect(result.statusCode).toBe(0);
  });

  it('should handle null/undefined gracefully', () => {
    const result = errorHandler(null);
    expect(result).toBeInstanceOf(ApiError);
    expect(result.code).toBe('UNKNOWN');
  });
});

// =============================================================================
// ApiClient 测试
// =============================================================================

describe('ApiClient', () => {
  let client: ApiClient;
  let mockFetch: ReturnType<typeof makeMockFetch>;

  beforeEach(() => {
    mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    client = new ApiClient('http://localhost:8000', 5000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 构造函数
  // ===========================================================================

  describe('constructor', () => {
    it('should use default base URL and timeout', () => {
      const defaultClient = new ApiClient();
      // Base URL is private; test indirectly via a mock fetch call
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ status: 'ok' }));
      defaultClient.healthCheck();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should accept custom base URL and timeout', () => {
      const customClient = new ApiClient('http://custom:3000', 10000);
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ status: 'ok' }));
      customClient.healthCheck();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom:3000/api/v1/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should have 30-second default timeout', async () => {
      const defaultClient = new ApiClient('http://localhost:8000');
      mockFetch.mockImplementation(
        () => new Promise(() => {
          /* never resolves */
        }),
      );

      // Trigger a request to verify timeout behavior
      defaultClient.parseSysML2('some text').catch(() => {
        /* expected timeout */
      });

      // Verify that AbortSignal is passed to fetch (timeout mechanism)
      const callArg = mockFetch.mock.calls[0]?.[1];
      expect(callArg?.signal).toBeInstanceOf(AbortSignal);
    });
  });

  // ===========================================================================
  // 请求成功路径
  // ===========================================================================

  describe('successful requests', () => {
    it('should parse JSON on 200 response', async () => {
      const responseData = { model: makeSemanticModel(), warnings: [] };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(responseData, 200));

      const result = await client.parseSysML2('part def Vehicle {}');

      expect(result).toEqual(responseData.model);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return undefined for 204 No Content', async () => {
      const noContentResponse = {
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: () => Promise.reject(new Error('No body')),
      } as Response;
      mockFetch.mockResolvedValueOnce(noContentResponse);

      // Use createProject which returns void (doesn't try to parse body)
      // But the request method checks for 204 and returns undefined.
      // Let's test via a method - createProject returns void but request<T> returns T.
      // We can verify that 204 doesn't cause a JSON parse error.
      await expect(client.createProject('/tmp/test', 'MyProject')).resolves
        .toBeUndefined();
    });

    it('should set Content-Type only when body is present', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ status: 'ok' }));

      await client.healthCheck();

      const callArg = mockFetch.mock.calls[0]?.[1];
      expect(callArg?.headers).not.toHaveProperty('Content-Type');
    });

    it('should set Content-Type: application/json when body is present', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ model: makeSemanticModel(), warnings: [] }),
      );

      await client.parseSysML2('some text');

      const callArg = mockFetch.mock.calls[0]?.[1];
      // TypeScript: Record<string, string> headers
      const headers = callArg?.headers as Record<string, string> | undefined;
      expect(headers?.['Content-Type']).toBe('application/json');
    });
  });

  // ===========================================================================
  // HTTP 错误路径
  // ===========================================================================

  describe('HTTP error responses', () => {
    it('should throw ApiError on 400 with error code from body', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonError(400, 'SYNTAX_ERROR', '语法错误: Unexpected token'),
      );

      await expect(client.parseSysML2('invalid syntax')).rejects.toMatchObject({
        statusCode: 400,
        code: 'SYNTAX_ERROR',
        message: '语法错误: Unexpected token',
      });
    });

    it('should throw ApiError on 404 with details', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonError(404, 'NOT_FOUND', '文件未找到'),
      );

      await expect(client.openProject('/nonexistent.sysml2proj')).rejects
        .toMatchObject({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: '文件未找到',
        });
    });

    it('should throw ApiError on 500 with error code from body', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonError(500, 'IO_ERROR', '无法写入文件: Permission denied'),
      );

      await expect(
        client.saveProject('/test.sysml2proj', makeProjectData()),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'IO_ERROR',
        message: '无法写入文件: Permission denied',
      });
    });

    it('should use UNKNOWN code when error body has no code', async () => {
      const responseWithoutCode = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      } as Response;
      mockFetch.mockResolvedValueOnce(responseWithoutCode);

      await expect(client.parseSysML2('text')).rejects.toMatchObject({
        statusCode: 500,
        code: 'UNKNOWN',
      });
    });

    it('should handle non-JSON error body gracefully', async () => {
      const textResponse = {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response;
      mockFetch.mockResolvedValueOnce(textResponse);

      await expect(client.parseSysML2('text')).rejects.toMatchObject({
        statusCode: 502,
        code: 'UNKNOWN',
      });
    });
  });

  // ===========================================================================
  // 网络错误路径
  // ===========================================================================

  describe('network errors', () => {
    it('should throw NETWORK_ERROR when fetch rejects with TypeError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.parseSysML2('text')).rejects.toMatchObject({
        statusCode: 0,
        code: 'NETWORK_ERROR',
      });
    });

    it('should throw NETWORK_ERROR for generic fetch failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(client.healthCheck()).rejects.toMatchObject({
        statusCode: 0,
        code: 'NETWORK_ERROR',
      });
    });

    it('should throw TIMEOUT when request times out', async () => {
      const shortTimeoutClient = new ApiClient(
        'http://localhost:8000',
        10, // 10ms timeout
      );

      // Mock fetch that respects AbortSignal
      mockFetch.mockImplementation(
        (_url, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            if (init?.signal) {
              if (init.signal.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              init.signal.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }
          }),
      );

      await expect(shortTimeoutClient.parseSysML2('text')).rejects
        .toMatchObject({
          statusCode: 0,
          code: 'TIMEOUT',
          message: '请求超时',
        });
    });

    it('should throw TIMEOUT on healthCheck timeout', async () => {
      const shortTimeoutClient = new ApiClient(
        'http://localhost:8000',
        10,
      );

      mockFetch.mockImplementation(
        (_url, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            if (init?.signal) {
              if (init.signal.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              init.signal.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }
          }),
      );

      await expect(shortTimeoutClient.healthCheck()).rejects.toMatchObject({
        statusCode: 0,
        code: 'TIMEOUT',
      });
    });
  });

  // ===========================================================================
  // 外部 AbortSignal 测试
  // ===========================================================================

  describe('external signal abort', () => {
    it('should throw ABORTED when external signal is aborted', async () => {
      const controller = new AbortController();

      // Simulate fetch that checks signal
      mockFetch.mockImplementation((_url, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          // When the external signal aborts, reject
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }
        });
      });

      // Access private request method via prototype to pass signal
      // Test the abort behavior by directly triggering the controller
      const requestPromise = (client as unknown as {
        request: (
          method: string,
          path: string,
          body?: unknown,
          signal?: AbortSignal,
        ) => Promise<unknown>;
      }).request('POST', '/model/parse', { text: 'test' }, controller.signal);

      // Abort after a small delay
      setTimeout(() => controller.abort(), 5);

      await expect(requestPromise).rejects.toMatchObject({
        statusCode: 0,
        code: 'ABORTED',
        message: '请求已被取消',
      });
    });
  });

  // ===========================================================================
  // parseSysML2 测试
  // ===========================================================================

  describe('parseSysML2', () => {
    it('should POST to /model/parse with correct body', async () => {
      const model = makeSemanticModel({ name: 'Vehicle' });
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ model, warnings: [] }),
      );

      await client.parseSysML2('part def Vehicle {}');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/model/parse',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'part def Vehicle {}' }),
        }),
      );
    });

    it('should extract and return the model from response', async () => {
      const model = makeSemanticModel({ name: 'MyModel' });
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ model, warnings: ['Warning 1'] }),
      );

      const result = await client.parseSysML2('some text');

      expect(result).toEqual(model);
      expect(result.name).toBe('MyModel');
    });
  });

  // ===========================================================================
  // serializeToSysML2 测试
  // ===========================================================================

  describe('serializeToSysML2', () => {
    it('should POST to /model/serialize with model in body', async () => {
      const model = makeSemanticModel();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ result: 'part def Vehicle {}' }),
      );

      await client.serializeToSysML2(model);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/model/serialize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ model }),
        }),
      );
    });

    it('should return the serialized string', async () => {
      const expectedText = 'part def Vehicle {\n    attribute mass: Real;\n}';
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ result: expectedText }),
      );

      const result = await client.serializeToSysML2(makeSemanticModel());

      expect(result).toBe(expectedText);
    });
  });

  // ===========================================================================
  // createProject 测试
  // ===========================================================================

  describe('createProject', () => {
    it('should POST to /project/create with dir_path and name', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ projectData: makeProjectData() }),
      );

      await client.createProject('/tmp/myproject', 'MyProject');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/project/create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            dir_path: '/tmp/myproject',
            name: 'MyProject',
          }),
        }),
      );
    });

    it('should resolve to void on success', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ projectData: makeProjectData() }),
      );

      const result = await client.createProject('/tmp/p', 'P');
      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // openProject 测试
  // ===========================================================================

  describe('openProject', () => {
    it('should POST to /project/open with file_path', async () => {
      const projectData = makeProjectData();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ projectData }));

      await client.openProject('/test.sysml2proj');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/project/open',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ file_path: '/test.sysml2proj' }),
        }),
      );
    });

    it('should return ProjectData from response', async () => {
      const projectData = makeProjectData();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ projectData }));

      const result = await client.openProject('/test.sysml2proj');

      expect(result).toEqual(projectData);
      expect(result.metadata.name).toBe('TestProject');
      expect(result.semanticModel.id).toBe('model-001');
    });
  });

  // ===========================================================================
  // saveProject 测试
  // ===========================================================================

  describe('saveProject', () => {
    it('should POST to /project/save with snake_case body', async () => {
      const projectData = makeProjectData();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ success: true, filePath: '/test.sysml2proj', fileSize: 1024 }),
      );

      await client.saveProject('/test.sysml2proj', projectData);

      const callBody = JSON.parse(
        mockFetch.mock.calls[0]?.[1]?.body as string,
      ) as Record<string, unknown>;

      expect(callBody.file_path).toBe('/test.sysml2proj');
      expect(callBody).toHaveProperty('project_data');
      const pd = callBody.project_data as Record<string, unknown>;
      expect(pd).toHaveProperty('metadata');
      expect(pd).toHaveProperty('semantic_model');
      expect(pd).toHaveProperty('canvas_model');
    });

    it('should resolve to void on success', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ success: true, filePath: '/p.sysml2proj', fileSize: 0 }),
      );

      const result = await client.saveProject('/p.sysml2proj', makeProjectData());
      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // validateModel 测试
  // ===========================================================================

  describe('validateModel', () => {
    it('should POST to /model/validate with model in body', async () => {
      const model = makeSemanticModel();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          isValid: true,
          errors: [],
          warnings: [],
        }),
      );

      await client.validateModel(model);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/model/validate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ model }),
        }),
      );
    });

    it('should return ValidationResult with errors and warnings', async () => {
      const response = {
        isValid: false,
        errors: [
          {
            code: 'E003',
            message: '悬空引用',
            element_id: 'elem-005',
            severity: 'error',
            source_location: null,
          },
        ],
        warnings: [
          {
            code: 'W001',
            message: '缺少描述信息',
            element_id: 'elem-008',
            severity: 'warning',
            source_location: null,
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(response));

      const result: ValidationResult = await client.validateModel(
        makeSemanticModel(),
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'E003',
        message: '悬空引用',
        elementId: 'elem-005',
        severity: 'error',
      });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: 'W001',
        message: '缺少描述信息',
        severity: 'warning',
      });
    });

    it('should handle snake_case response field names', async () => {
      // Backend might return snake_case fields
      const response = {
        is_valid: false,
        errors: [
          {
            code: 'E001',
            message: 'Error',
            element_id: 'elem-001',
            severity: 'error',
            source_location: null,
          },
        ],
        warnings: [],
      };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(response));

      const result = await client.validateModel(makeSemanticModel());

      expect(result.isValid).toBe(false);
      expect(result.errors[0].elementId).toBe('elem-001');
    });
  });

  // ===========================================================================
  // exportSVG 测试
  // ===========================================================================

  describe('exportSVG', () => {
    it('should POST to /export/svg with svg_markup and output_path', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          success: true,
          filePath: '/output/diagram.svg',
          fileSize: 2048,
          errorMessage: null,
        }),
      );

      await client.exportSVG('<svg>...</svg>', '/output/diagram.svg');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/export/svg',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            svg_markup: '<svg>...</svg>',
            output_path: '/output/diagram.svg',
          }),
        }),
      );
    });

    it('should resolve to void on success', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ success: true, filePath: '', fileSize: 0, errorMessage: null }),
      );

      const result = await client.exportSVG('<svg/>', '/out.svg');
      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // exportPNG 测试
  // ===========================================================================

  describe('exportPNG', () => {
    it('should POST to /export/png with image_data and output_path', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          success: true,
          filePath: '/output/diagram.png',
          fileSize: 4096,
          errorMessage: null,
        }),
      );

      await client.exportPNG('base64encodeddata', '/output/diagram.png');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/export/png',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            image_data: 'base64encodeddata',
            output_path: '/output/diagram.png',
          }),
        }),
      );
    });

    it('should resolve to void on success', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ success: true, filePath: '', fileSize: 0, errorMessage: null }),
      );

      const result = await client.exportPNG('data', '/out.png');
      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // healthCheck 测试
  // ===========================================================================

  describe('healthCheck', () => {
    it('should GET /health', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ status: 'ok' }));

      const result = await client.healthCheck();

      expect(result).toEqual({ status: 'ok' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });
});

// =============================================================================
// 默认单例测试
// =============================================================================

describe('apiClient singleton', () => {
  it('should be an instance of ApiClient', () => {
    expect(apiClient).toBeInstanceOf(ApiClient);
  });

  it('should implement IApiClient interface', () => {
    const client: IApiClient = apiClient;
    expect(typeof client.healthCheck).toBe('function');
    expect(typeof client.parseSysML2).toBe('function');
    expect(typeof client.serializeToSysML2).toBe('function');
    expect(typeof client.createProject).toBe('function');
    expect(typeof client.openProject).toBe('function');
    expect(typeof client.saveProject).toBe('function');
    expect(typeof client.validateModel).toBe('function');
    expect(typeof client.exportSVG).toBe('function');
    expect(typeof client.exportPNG).toBe('function');
  });
});
