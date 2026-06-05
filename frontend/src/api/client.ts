/**
 * API Client — 后端通信层
 *
 * 封装所有后端 HTTP 调用，提供类型安全的请求/响应接口，统一错误处理。
 */

// ---- 基础配置 ----

const API_BASE = '/api/v1';

// ---- 错误类型 ----

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---- 通用请求方法 ----

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        body?.code || 'UNKNOWN',
        body?.message || `HTTP ${response.status}: ${response.statusText}`,
        body,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请确认后端服务已启动');
  }
}

// ---- API 方法 ----

export interface HealthResponse {
  status: string;
}

export interface ParseSysML2Request {
  text: string;
}

export interface ParseSysML2Response {
  model: Record<string, unknown>;
  warnings: string[];
}

/**
 * 健康检查 — 确认后端服务可用
 */
export async function healthCheck(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

/**
 * 解析 SysML v2 文本为内部模型
 */
export async function parseSysML2(text: string): Promise<ParseSysML2Response> {
  return request<ParseSysML2Response>('/model/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// ---- API Client 接口定义 (用于后续扩展) ----

export interface IApiClient {
  healthCheck(): Promise<HealthResponse>;
  parseSysML2(text: string): Promise<ParseSysML2Response>;
}

export const apiClient: IApiClient = {
  healthCheck,
  parseSysML2,
};
