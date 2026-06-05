# M-BE-03: Model Validator（模型校验器）

> **详细设计**: §4.3
> **依赖**: M-BE-02（Model Manager）
> **目标**: 完整性检查（阻塞性错误）+ 一致性检查（警告），可扩展规则体系

---

## 任务清单

### 1. 校验框架

- [ ] **1.1** 定义 `ValidationResult` dataclass（is_valid, errors: list[ValidationIssue], warnings: list[ValidationIssue]）
- [ ] **1.2** 定义 `ValidationIssue` dataclass（code, message, element_id, severity, source_location）
- [ ] **1.3** 实现 `ModelValidator.__init__(model_manager)`：持有 ModelManager 引用
- [ ] **1.4** 实现 `validate() -> ValidationResult`：遍历所有规则，收集 issues
- [ ] **1.5** 实现 `validate_element(element_id) -> ValidationResult`：只对单个元素执行规则
- [ ] **1.6** 实现规则注册机制：`register_rule(code, severity, check_fn)` 或装饰器

### 2. 完整性检查（Error 级别）

- [ ] **2.1** 实现 E001「元素名称为空」：`element.name` 为空或纯空白 → error
- [ ] **2.2** 实现 E002「限定名重复」：`qualifiedName` 相同的两个元素 → error
- [ ] **2.3** 实现 E003「悬空引用—Usage 引用不存在的 Definition」：`ModelManager.get_dangling_references()` → error
- [ ] **2.4** 实现 E004「关系源端元素不存在」：`rel.sourceId` 在 elements 中找不到 → error
- [ ] **2.5** 实现 E005「关系目标端元素不存在」：`rel.targetId` 在 elements 中找不到 → error
- [ ] **2.6** 测试：创建无名称元素 → E001；创建两个同名同级元素 → E002

### 3. 一致性检查（Warning 级别）

- [ ] **3.1** 实现 W001「元素无描述信息」：非 Comment 类元素 description 为空 → warning
- [ ] **3.2** 实现 W002「PartDef 无端口定义」：PartDef 的 properties.ports 为空 → warning
- [ ] **3.3** 实现 W003「孤岛元素」：元素无任何 relationship（source 或 target）→ warning
- [ ] **3.4** 实现 W004「缺少需求追溯」：设计元素（Part/Item/Action）未关联任何 Satisfy/Verify 关系 → warning
- [ ] **3.5** 测试：创建无 description 的 PartDef → W001；创建无连接的 Block → W003

### 4. 校验结果格式化

- [ ] **4.1** 实现 `format_validation_result(result) -> str`：人类可读的错误列表
- [ ] **4.2** 错误列表按 severity → code 排序
- [ ] **4.3** 测试：formatted 输出包含元素名、错误码、错误消息

---

> **完成标准**: 9 条规则全部实现且通过独立测试，validate() 返回完整的 errors + warnings
