/**
 * API Client — 后端通信层
 *
 * 封装所有后端 HTTP 调用，提供类型安全的请求/响应接口，统一错误处理。
 * 来源: 详细设计 §3.9
 */

import type { SemanticModel } from '@/types/semantic-model';
import type { CanvasModel } from '@/types/canvas-model';
import { ApiError, errorHandler } from './errors';

// Re-export for backward compatibility
export { ApiError, errorHandler } from './errors';

// ---- 类型定义 ----

/** 项目元数据 */
export interface ProjectMetadata {
  name: string;
  created: string; // ISO 8601
  modified: string; // ISO 8601
  version: string; // 项目格式版本号
}

/** 项目数据（语义模型 + 画布模型 + 元数据） */
export interface ProjectData {
  semanticModel: SemanticModel;
  canvasModel: CanvasModel;
  metadata: ProjectMetadata;
}

/** 校验问题 */
export interface ValidationIssue {
  code: string;
  message: string;
  elementId: string | null;
  severity: 'error' | 'warning';
  sourceLocation: string | null;
}

/** 校验结果 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** 健康检查响应 */
export interface HealthResponse {
  status: string;
}

// ---- 内部请求/响应映射类型 ----

interface ParseResponse {
  model: SemanticModel;
  warnings: string[];
}

interface SerializeResponse {
  result: string;
}

interface CreateProjectResponse {
  projectData: ProjectData;
}

interface OpenProjectResponse {
  projectData: ProjectData;
}

interface SaveProjectResponse {
  success: boolean;
  filePath: string;
  fileSize: number;
}

interface ValidateRawIssue {
  code: string;
  message: string;
  element_id: string | null;
  severity: 'error' | 'warning';
  source_location: string | null;
}

interface ValidateResponse {
  /** Backend may return camelCase or snake_case */
  isValid?: boolean;
  is_valid?: boolean;
  errors: ValidateRawIssue[];
  warnings: ValidateRawIssue[];
}

interface ExportResponse {
  success: boolean;
  filePath: string;
  fileSize: number;
  errorMessage: string | null;
}

// ---- IApiClient 接口 ----

export interface IApiClient {
  /** 健康检查 — 确认后端服务可用 */
  healthCheck(): Promise<HealthResponse>;

  /** 解析 SysML v2 文本为语义模型 */
  parseSysML2(text: string): Promise<SemanticModel>;

  /** 将语义模型序列化为 SysML v2 文本 */
  serializeToSysML2(model: SemanticModel): Promise<string>;

  /** 创建新项目 */
  createProject(dirPath: string, name: string): Promise<void>;

  /** 打开项目文件 */
  openProject(filePath: string): Promise<ProjectData>;

  /** 保存项目 */
  saveProject(filePath: string, data: ProjectData): Promise<void>;

  /** 校验模型 */
  validateModel(model: SemanticModel): Promise<ValidationResult>;

  /** 导出 SVG */
  exportSVG(svgMarkup: string, outputPath: string): Promise<void>;

  /** 导出 PNG */
  exportPNG(base64Data: string, outputPath: string): Promise<void>;
}

// ---- ApiClient 实现 ----

const DEFAULT_BASE_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 30_000;
const API_PREFIX = '/api/v1';

export class ApiClient implements IApiClient {
  private readonly baseUrl: string;
  private readonly defaultTimeout: number;

  constructor(baseUrl: string = DEFAULT_BASE_URL, defaultTimeout: number = DEFAULT_TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.defaultTimeout = defaultTimeout;
  }

  // =========================================================================
  // 通用请求方法
  // =========================================================================

  /**
   * 发起类型安全的 HTTP 请求
   *
   * @param method  HTTP 方法
   * @param path    API 路径（相对于 /api/v1，如 '/model/parse'）
   * @param body    请求体（可选，自动 JSON 序列化）
   * @param signal  外部 AbortSignal（可选，用于调用方取消请求）
   * @returns       解析后的 JSON 响应体
   * @throws        非 2xx 响应、网络错误或超时时抛出 ApiError
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;

    // 超时控制：创建内部 AbortController，与外部 signal 竞争
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

    // 如果调用方传入了 signal，需要同时响应该 signal
    const onExternalAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const requestInit: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestInit);

      // 清除超时定时器（请求已完成）
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);

      if (!response.ok) {
        // 尝试解析服务端错误体
        let errorBody: Record<string, unknown> | undefined;
        try {
          errorBody = (await response.json()) as Record<string, unknown>;
        } catch {
          errorBody = undefined;
        }

        const errorCode =
          typeof errorBody?.code === 'string' ? errorBody.code : 'UNKNOWN';
        const errorMessage =
          typeof errorBody?.message === 'string'
            ? errorBody.message
            : `HTTP ${response.status}: ${response.statusText}`;

        throw new ApiError(response.status, errorCode, errorMessage, errorBody);
      }

      // 204 No Content — 无响应体
      if (response.status === 204) {
        return undefined as unknown as T;
      }

      return (await response.json()) as T;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);

      // 如果是我们的 AbortController 触发的（超时），转换为 TIMEOUT
      if (controller.signal.aborted && !signal?.aborted) {
        throw new ApiError(0, 'TIMEOUT', '请求超时');
      }

      // 如果是外部 signal 触发的，透传原始错误
      if (signal?.aborted) {
        throw new ApiError(0, 'ABORTED', '请求已被取消');
      }

      // 其他错误通过 errorHandler 统一转换
      throw errorHandler(error);
    }
  }

  // =========================================================================
  // 公共 API 方法
  // =========================================================================

  /** 健康检查 — 确认后端服务可用 */
  async healthCheck(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  /** 解析 SysML v2 文本为语义模型 */
  async parseSysML2(text: string): Promise<SemanticModel> {
    const response = await this.request<ParseResponse>('POST', '/model/parse', {
      text,
    });
    return response.model;
  }

  /** 将语义模型序列化为 SysML v2 文本 */
  async serializeToSysML2(model: SemanticModel): Promise<string> {
    const response = await this.request<SerializeResponse>(
      'POST',
      '/model/serialize',
      { model },
    );
    return response.result;
  }

  /** 创建新项目 */
  async createProject(dirPath: string, name: string): Promise<void> {
    await this.request<CreateProjectResponse>('POST', '/project/create', {
      dir_path: dirPath,
      name,
    });
  }

  /** 打开项目文件 */
  async openProject(filePath: string): Promise<ProjectData> {
    const response = await this.request<OpenProjectResponse>(
      'POST',
      '/project/open',
      { file_path: filePath },
    );
    return response.projectData;
  }

  /** 保存项目 */
  async saveProject(
    filePath: string,
    data: ProjectData,
  ): Promise<void> {
    await this.request<SaveProjectResponse>('POST', '/project/save', {
      file_path: filePath,
      project_data: {
        metadata: data.metadata,
        semantic_model: data.semanticModel,
        canvas_model: data.canvasModel,
      },
    });
  }

  /** 校验模型 */
  async validateModel(model: SemanticModel): Promise<ValidationResult> {
    const response = await this.request<ValidateResponse>(
      'POST',
      '/model/validate',
      { model },
    );
    const valid = response.isValid ?? response.is_valid ?? true;
    return {
      isValid: valid,
      errors: response.errors.map((issue) => ({
        code: issue.code,
        message: issue.message,
        elementId: issue.element_id,
        severity: issue.severity,
        sourceLocation: issue.source_location,
      })),
      warnings: response.warnings.map((issue) => ({
        code: issue.code,
        message: issue.message,
        elementId: issue.element_id,
        severity: issue.severity,
        sourceLocation: issue.source_location,
      })),
    };
  }

  /** 导出 SVG */
  async exportSVG(svgMarkup: string, outputPath: string): Promise<void> {
    await this.request<ExportResponse>('POST', '/export/svg', {
      svg_markup: svgMarkup,
      output_path: outputPath,
    });
  }

  /** 导出 PNG */
  async exportPNG(base64Data: string, outputPath: string): Promise<void> {
    await this.request<ExportResponse>('POST', '/export/png', {
      image_data: base64Data,
      output_path: outputPath,
    });
  }
}

// ---- 默认单例 ----

const defaultClient = new ApiClient();
export const apiClient: IApiClient = defaultClient;

// ---- 向后兼容的独立函数导出 ----

/**
 * 健康检查 — 确认后端服务可用
 * @deprecated 请使用 apiClient.healthCheck()
 */
export async function healthCheck(): Promise<HealthResponse> {
  return defaultClient.healthCheck();
}

/**
 * 解析 SysML v2 文本为内部模型
 * @deprecated 请使用 apiClient.parseSysML2()
 */
export async function parseSysML2(text: string): Promise<SemanticModel> {
  return defaultClient.parseSysML2(text);
}
