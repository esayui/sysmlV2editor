/**
 * API Error — 统一错误类型与错误处理
 * 来源: 详细设计 §3.9.3
 */

/**
 * API 调用统一错误类
 *
 * - statusCode=0 用于客户端错误（网络断开、超时）
 * - statusCode>0 用于服务端 HTTP 错误
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // 保持正确的原型链（TypeScript 编译到 ES5 时需要）
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * 将任意错误统一转换为 ApiError
 *
 * 转换规则：
 * - 已是 ApiError → 直接返回
 * - DOMException AbortError → TIMEOUT
 * - TypeError（fetch 网络失败） → NETWORK_ERROR
 * - 其他 Error → 包装为 NETWORK_ERROR
 * - 非 Error 值 → UNKNOWN
 */
export function errorHandler(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError(0, 'TIMEOUT', '请求超时');
  }

  if (error instanceof TypeError) {
    return new ApiError(
      0,
      'NETWORK_ERROR',
      '网络连接失败，请确认后端服务已启动',
    );
  }

  if (error instanceof Error) {
    return new ApiError(0, 'NETWORK_ERROR', error.message || '网络连接失败');
  }

  return new ApiError(0, 'UNKNOWN', '未知错误');
}
