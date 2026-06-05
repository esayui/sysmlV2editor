# M-BE-04: File Service（文件服务）

> **详细设计**: §4.4
> **依赖**: M-BE-01（SysML v2 Parser）, M-BE-02（Model Manager）
> **目标**: 项目文件的创建、打开、保存、自动保存、备份恢复

---

## 任务清单

### 1. 项目文件格式

- [ ] **1.1** 定义 `.sysml2proj` 文件 JSON Schema（formatVersion, metadata, semanticModel, canvasModel）
- [ ] **1.2** 实现 `ProjectMetadata` 类（name, created, modified, version）
- [ ] **1.3** 实现版本兼容检查：formatVersion 不匹配时给出警告

### 2. 创建项目

- [ ] **2.1** 实现 `create_project(dir_path, name) -> ProjectData`：
  - 在 dir_path 下创建 `<name>/` 目录
  - 创建 `<name>.sysml2proj` 文件（JSON 格式，包含空模型）
  - 创建 `model.sysml2` 文件（空文本）
  - 创建 `auto-save/` 和 `exports/` 子目录
- [ ] **2.2** 名称合法性校验：不能含 `<>:"/\\|?*` 等非法字符
- [ ] **2.3** 路径存在性检查：dir_path 不存在 → 错误提示
- [ ] **2.4** 测试：create → 目录和文件在磁盘上存在

### 3. 打开项目

- [ ] **3.1** 实现 `open_project(file_path) -> ProjectData`：
  - 读取 `.sysml2proj` JSON 文件
  - 反序列化 semanticModel 和 canvasModel
  - 校验 JSON Schema
- [ ] **3.2** 文件格式错误（非法 JSON / 缺少关键字段）→ 明确错误提示
- [ ] **3.3** 文件不存在 → FileNotFoundError
- [ ] **3.4** 测试：save → open → 得到一致数据

### 4. 保存项目

- [ ] **4.1** 实现 `save_project(file_path, data)`：
  - 更新 metadata.modified 时间戳
  - 先写入临时文件 `<name>.tmp`
  - 备份当前文件 → `<name>.sysml2proj.bak`
  - 临时文件 rename 为目标文件（原子操作）
  - 成功 → 删除 .bak 备份
  - 失败 → .bak 保留用于恢复
- [ ] **4.2** 同步导出 `.sysml2` 文本文件（用于 Git diff）
- [ ] **4.3** 测试：save 失败（模拟磁盘满）→ 原始文件未损坏，.bak 文件存在

### 5. 自动保存

- [ ] **5.1** 实现 `auto_save(data)`：使用独立文件名（时间戳）写到 `auto-save/` 目录
- [ ] **5.2** 实现定时自动保存：前端每 5 分钟调用一次（或编辑暂停 3 秒后）
- [ ] **5.3** 实现崩溃恢复：启动时检查 `auto-save/` 中是否有未清理的临时文件 → 提示用户恢复
- [ ] **5.4** 自动保存文件上限：保留最近 5 个 auto-save，删除旧的
- [ ] **5.5** 测试：auto_save → auto-save/ 目录下有对应文件；崩溃恢复提示

---

> **完成标准**: 创建/打开/保存 roundtrip 数据一致，保存失败不损坏文件，自动保存可用
