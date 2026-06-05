# M-BE-01: SysML v2 Parser（文本解析器）

> **详细设计**: §4.1
> **依赖**: 无
> **目标**: 完整 SysML v2 文本语法解析，文本 ↔ AST ↔ 内部语义模型 双向转换
> **状态**: ✅ 已完成 — 138 tests passed

---

## 任务清单

### 1. 语法文件

- [ ] **1.1** 从 OMG 官方获取 SysML v2 文本语法 EBNF 规范文档
- [ ] **1.2** 创建 `common.lark`：词法规则（关键字、标识符、数字、字符串、注释、空白）
- [ ] **1.3** 创建 `kernel.lark`：核心语法（命名空间、限定名、类型引用、多重性）
- [ ] **1.4** 创建 `declarations.lark`：声明语法（part def, item def, port def, attribute, requirement, constraint, package 等）
- [ ] **1.5** 创建 `expressions.lark`：表达式语法（约束表达式、值表达式）
- [ ] **1.6** 创建 `sysml2.lark`：主文件，导入所有子语法文件
- [ ] **1.7** 验证：Lark 能成功编译 `sysml2.lark`，无冲突错误

### 2. Parser 封装

- [ ] **2.1** 实现 `SysML2Parser.__init__`：加载语法文件，创建 `lark.Lark` 实例（使用 LALR(1) 模式）
- [ ] **2.2** 实现 `SysML2Parser.parse(text) -> lark.Tree`：
  - 解析文本
  - 捕获 Lark 异常 → 转换为 `SysML2SyntaxError`（含行号、列号、错误上下文）
- [ ] **2.3** 定义 `SysML2SyntaxError` 异常类（message, line, column, context）
- [ ] **2.4** 测试：解析 `part def Vehicle { }` → 返回 lark.Tree；解析错误文本 → 抛出 SysML2SyntaxError

### 3. AST 节点定义

- [ ] **3.1** 创建 `ast_nodes.py`：定义所有 AST 节点 dataclass
- [ ] **3.2** 实现 `SourceLocation`：line, column, end_line, end_column
- [ ] **3.3** 实现声明节点：`PackageDecl`, `PartDef`, `PartUsage`, `PortDef`, `PortUsage`, `ItemDef`, `ItemUsage`, `InterfaceDef`, `AttributeDef`, `EnumerationDef`
- [ ] **3.4** 实现行为节点：`ActionDef`, `ActionUsage`, `StateDef`, `StateUsage`, `TransitionDef`, `ActorDef`, `UseCaseDef`
- [ ] **3.5** 实现需求节点：`RequirementDef`, `RequirementUsage`, `StakeholderRequirementDef`
- [ ] **3.6** 实现参数节点：`ConstraintDef`, `ConstraintUsage`
- [ ] **3.7** 实现关系节点：`ConnectionDef`, `BindingDef`, `FlowDef`, `SatisfyRelation`, `VerifyRelation`, `Subclassification`, `Allocation`
- [ ] **3.8** 实现通用节点：`CommentNode`, `PackageMember`

### 4. AST Builder（ParseTree → AST）

- [ ] **4.1** 实现 `ASTBuilder.build(tree: lark.Tree) -> list[ASTNode]`
  - 使用 Lark Transformer 模式遍历 ParseTree
  - 跳过无关终端符号
  - 为每个 ASTNode 附加 SourceLocation
- [ ] **4.2** 实现声明语句转换：ParseTree 子树 → PartDef / PortDef / RequirementDef 等 ASTNode
- [ ] **4.3** 实现关系语句转换：connection / binding / satisfy 等
- [ ] **4.4** 实现表达式转换：约束表达式、值表达式
- [ ] **4.5** 测试：`part def Vehicle { attribute mass: Real; }` → AST 包含 PartDef 节点，其 features 含 AttributeDef

### 5. Model Builder（AST → SemanticModel）

- [ ] **5.1** 实现 `ModelBuilder.build(ast_nodes: list[ASTNode]) -> SemanticModel`
  - 分配 UUID 给每个元素
  - 建立 qualifiedName（递归拼接父级名称）
  - 设置 ownerId（基于 AST 层级）
- [ ] **5.2** 实现命名空间解析：遍历 Package 层级，为 Package 内的元素设置 qualifiedName
- [ ] **5.3** 实现交叉引用建立：Usage 节点引用 Definition → 在 elements 中查找 → 在 properties 中存储引用
- [ ] **5.4** 实现 Package 转换：PackageDecl → Package + 将其直属成员加入 elementIds
- [ ] **5.5** 测试：多层 Package + PartDef → SemanticModel 中 qualifiedName 正确

### 6. Text Generator（SemanticModel → 文本）

- [ ] **6.1** 实现 `TextGenerator.generate(model, format=True) -> str`：
  - 遍历 SemanticModel.packages → 为每个 Package 生成 `package <name> { ... }`
  - 遍历顶层 elements → 按类型生成对应声明语句
  - 遍历 relationships → 生成关系语句
- [ ] **6.2** 实现格式化输出：缩进（2 空格/4 空格可选）、换行、空行分隔
- [ ] **6.3** 实现紧凑输出（format=False）：单行，节省空间
- [ ] **6.4** 实现 `generate_element(element) -> str`：单个元素的文本表示
- [ ] **6.5** 测试：parse → generate → parse → generate 两次结果一致（roundtrip 稳定性）

### 7. 集成测试

- [ ] **7.1** 准备 SysML v2 示例文件（来自 OMG 或 SysON 的测试用例）
- [ ] **7.2** 测试完整模型解析：多 Package、多层级 PartDef、多种 Relationship
- [ ] **7.3** 测试错误恢复：语法错误时不崩溃，给出有用的错误信息
- [ ] **7.4** 性能测试：1000 条语句的模型解析 < 3 秒（需求 §4.1）

---

> **完成标准**: 能解析 OMG 官方 SysML v2 示例文件，roundtrip 一致，语法错误时给出精确行号列号
