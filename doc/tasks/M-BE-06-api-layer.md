# M-BE-06: API Layer（接口层）

> **详细设计**: §4.6
> **依赖**: M-BE-02..05（所有后端 Service）
> **目标**: FastAPI REST 路由，请求校验，响应格式化，错误处理

---

## 任务清单

### 1. FastAPI 应用配置

- [x] **1.1** 实现 `app/main.py`：FastAPI 实例化、CORS 中间件（`allow_origins=["http://localhost:5173"]`）
- [x] **1.2** 注册 `/api/v1` 路由前缀
- [x] **1.3** 实现全局异常处理器：
  - `SysML2SyntaxError` → 400 + `{code: "SYNTAX_ERROR", message, location}`
  - `FileNotFoundError` → 404
  - `PermissionError` → 403
  - 未捕获异常 → 500 + `{code: "INTERNAL_ERROR", message}`
- [x] **1.4** 实现请求日志中间件：记录 method、path、status、duration
- [x] **1.5** 测试：GET /api/v1/health → 200

### 2. Pydantic Schema 定义

- [x] **2.1** 定义请求 Schema：`ParseRequest`, `CreateProjectRequest`, `OpenProjectRequest`, `SaveProjectRequest`, `ValidateRequest`, `ExportSVGRequest`, `ExportPNGRequest`
- [x] **2.2** 定义响应 Schema：`ParseResponse`, `CreateProjectResponse`, `OpenProjectResponse`, `SaveProjectResponse`, `ValidateResponse`, `ExportResponse`, `ErrorResponse`
- [x] **2.3** 字段级验证：文件路径非空、模型 JSON 非空、导出格式枚举
- [x] **2.4** 测试：发送空 name 的 CreateProjectRequest → 422 含字段级错误

### 3. 模型解析 API

- [x] **3.1** `POST /api/v1/model/parse`：
  - 接收 text → 调用 `parser.parse_to_model(text)`
  - 返回 `{model, warnings}`
  - 语法错误 → 400 + 错误位置
- [x] **3.2** `POST /api/v1/model/serialize`：
  - 接收 model JSON → 调用 `text_generator.generate(model)`
  - 返回 `{text}`
- [x] **3.3** 测试：传入合法文本 → 200 + model JSON；传入语法错误 → 400 + 错误信息

### 4. 文件操作 API

- [x] **4.1** `POST /api/v1/project/create`：
  - 接收 dir_path, name → 调用 `file_service.create_project()`
  - 返回 `{projectData}`
- [x] **4.2** `POST /api/v1/project/open`：
  - 接收 file_path → 调用 `file_service.open_project()`
  - 返回 `{projectData}`
- [x] **4.3** `POST /api/v1/project/save`：
  - 接收 file_path, projectData → 调用 `file_service.save_project()`
  - 返回 `{success: true}`
  - IO 错误 → 500 + 错误详情
- [x] **4.4** 测试：模拟 FileService Mock → 验证各 endpoint 行为

### 5. 校验 API

- [x] **5.1** `POST /api/v1/model/validate`：
  - 接收 model JSON → 构建临时 ModelManager → 调用 `validator.validate()`
  - 返回 `{isValid, errors: [...], warnings: [...]}`
- [x] **5.2** 测试：传入含错误的模型 → ValidationResult 包含正确的 errors

### 6. 导出 API

- [x] **6.1** `POST /api/v1/export/svg`：
  - 接收 svgMarkup, outputPath → 调用 `export_service.export_svg()`
  - 返回 `{success: true, filePath, fileSize}`
- [x] **6.2** `POST /api/v1/export/png`：
  - 接收 imageData(Base64), outputPath → 调用 `export_service.export_png()`
  - 返回 `{success: true, filePath, fileSize}`
- [x] **6.3** 测试：Mock ExportService → 验证路径和内容传递正确

### 7. 集成测试

- [x] **7.1** 使用 `httpx.AsyncClient` 对每个 endpoint 做集成测试
- [x] **7.2** 测试成功路径 + 错误路径（参数无效/服务崩溃/文件不存在）
- [x] **7.3** 测试 CORS：OPTIONS 预检请求返回正确 headers

---

> **完成标准**: 所有 7 个 endpoint 通过集成测试，请求校验返回 422，服务端错误返回统一 error 格式
