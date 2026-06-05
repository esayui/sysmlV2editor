# M-BE-02: Model Manager（模型管理器）

> **详细设计**: §4.2
> **依赖**: M-BE-01（SysML v2 Parser — 类型定义）
> **目标**: 语义模型 CRUD、查询、命名空间解析、交叉引用维护

---

## 任务清单

### 1. 模型生命周期

- [x] **1.1** 实现 `ModelManager.__init__`：初始化空模型状态
- [x] **1.2** 实现 `create_model(name) -> SemanticModel`：创建含 UUID 和名称的空模型
- [x] **1.3** 实现 `load_from_text(text) -> SemanticModel`：调用 Parser 解析文本，内部存储
- [x] **1.4** 实现 `export_to_text() -> str`：调用 TextGenerator 导出文本
- [x] **1.5** 测试：create → model.name === name, model.elements.length === 0

### 2. 查询操作

- [x] **2.1** 实现 `get_element(element_id) -> ModelElement`：按 UUID 精确查找
- [x] **2.2** 实现 `get_element_by_qualified_name(qname) -> ModelElement | None`：按限定名查找
- [x] **2.3** 实现 `get_children(element_id) -> list[ModelElement]`：ownerId === element_id 的所有元素
- [x] **2.4** 实现 `get_relationships(element_id) -> list[Relationship]`：sourceId 或 targetId 匹配
- [x] **2.5** 实现 `find_usages(definition_id) -> list[ModelElement]`：properties 中引用了该 Definition 的 Usage
- [x] **2.6** 实现 `resolve_reference(ref_text, context_id) -> ModelElement | None`：将 "a::b::c" 文本解析为实际元素
- [x] **2.7** 测试：3 层嵌套 Package 中元素的 qualifiedName 查询正确

### 3. 修改操作

- [x] **3.1** 实现 `add_element(element, owner_id=None) -> ModelElement`：
  - 分配 UUID（若未提供）
  - 设置 ownerId
  - 调用 check_name_conflict → 冲突则抛出 DuplicateNameError
  - 追加到 model.elements
- [x] **3.2** 实现 `update_element(element_id, patch) -> ModelElement`：合并 patch dict 到元素
- [x] **3.3** 实现 `delete_element(element_id)`：
  - 级联查找所有子元素 → 递归删除
  - 查找所有关联 relationship → 删除
  - 查找所有 usage 引用 → 标记为悬空或一并删除
  - 从 model.elements 移除
- [x] **3.4** 实现 `add_relationship(rel) -> Relationship`：分配 UUID → 追加到 model.relationships
- [x] **3.5** 实现 `delete_relationship(rel_id)`：从 model.relationships 移除
- [x] **3.6** 实现 `move_element(element_id, new_owner_id)`：
  - 更新 ownerId
  - 更新 qualifiedName（递归更新所有子孙）
- [x] **3.7** 测试：删除父 PartDef → 子 Attribute 消失 → 引用它的 Usage 失效

### 4. 名称冲突检测

- [x] **4.1** 实现 `check_name_conflict(name, parent_id) -> bool`：
  - 同 parent_id 下不可有重名元素
  - 同 Package 下不可有重名
- [x] **4.2** 实现 `get_dangling_references() -> list[str]`：遍历所有 Usage 的 reference → 查找定义是否存在
- [x] **4.3** 测试：添加同名元素 → 抛出 DuplicateNameError

---

> **完成标准**: CRUD 完整可用，级联删除正确，命名冲突检测，悬空引用可查询
