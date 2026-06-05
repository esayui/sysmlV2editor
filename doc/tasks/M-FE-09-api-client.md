# M-FE-09: API Client（后端通信层）

> **详细设计**: §3.9
> **依赖**: M-SH-01（后端基础运行）
> **目标**: 封装所有后端 HTTP 调用，TypeScript 类型安全，统一错误处理

---

## 任务清单

### 1. Client 骨架

- [ ] **1.1** 创建 `src/api/client.ts`：基于 fetch 的 HTTP Client 类
- [ ] **1.2** 实现 `request<T>(method, path, body?)` 通用方法：
  - 自动拼接 `http://localhost:8000` + path
  - 设置 Content-Type: application/json
  - 解析 JSON 响应
  - 非 2xx 响应抛出 ApiError
- [ ] **1.3** 实现超时控制（默认 30 秒，可通过 AbortController 取消）
- [ ] **1.4** 测试：Mock fetch，测试 200 → 正确解析；404 → 抛出 ApiError

### 2. 错误处理

- [ ] **2.1** 定义 `ApiError` 类（statusCode, code, message, details）
- [ ] **2.2** 实现 `errorHandler(error)`：统一转换为 ApiError
  - response 存在 → 解析 error body → new ApiError(status, code, message)
  - 网络错误 → ApiError(0, 'NETWORK_ERROR', '网络连接失败')
  - 超时 → ApiError(0, 'TIMEOUT', '请求超时')
- [ ] **2.3** 测试：Mock 各种错误场景 → 抛出正确 code 的 ApiError

### 3. 模型操作 API

- [ ] **3.1** 实现 `parseSysML2(text: string): Promise<SemanticModel>` → `POST /api/v1/model/parse`
- [ ] **3.2** 实现 `serializeToSysML2(model: SemanticModel): Promise<string>` → `POST /api/v1/model/serialize`
- [ ] **3.3** 测试：传入 text → 返回解析后的 SemanticModel

### 4. 文件操作 API

- [ ] **4.1** 实现 `createProject(dirPath, name): Promise<void>` → `POST /api/v1/project/create`
- [ ] **4.2** 实现 `openProject(filePath): Promise<ProjectData>` → `POST /api/v1/project/open`
- [ ] **4.3** 实现 `saveProject(filePath, data): Promise<void>` → `POST /api/v1/project/save`
- [ ] **4.4** 测试：Mock 响应，验证请求参数正确传递

### 5. 校验 API

- [ ] **5.1** 实现 `validateModel(model: SemanticModel): Promise<ValidationResult>` → `POST /api/v1/model/validate`
- [ ] **5.2** 测试：返回 ValidationResult 包含 errors 和 warnings

### 6. 导出 API

- [ ] **6.1** 实现 `exportSVG(svgMarkup, outputPath): Promise<void>` → `POST /api/v1/export/svg`
- [ ] **6.2** 实现 `exportPNG(base64Data, outputPath): Promise<void>` → `POST /api/v1/export/png`
- [ ] **6.3** 测试：请求参数正确传递

---

> **完成标准**: 所有 API 方法通过 Mock 测试，错误处理覆盖网络断开/超时/服务端错误
