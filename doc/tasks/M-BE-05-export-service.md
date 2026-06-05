# M-BE-05: Export Service（导出服务）

> **详细设计**: §4.5
> **依赖**: 无
> **目标**: SVG 和 PNG 格式的图表导出

---

## 任务清单

### 1. SVG 导出

- [ ] **1.1** 实现 `export_svg(svg_markup, output_path)`：
  - 接收前端 Fabric.js `canvas.toSVG()` 生成的 SVG 字符串
  - 写入 output_path 文件
  - 文件扩展名自动补充 .svg
- [ ] **1.2** 实现 SVG 优化（可选）：
  - 去除 Fabric.js 冗余属性
  - 压缩空白
- [ ] **1.3** 测试：传入 SVG 字符串 → 输出路径生成合法 SVG 文件

### 2. PNG 导出

- [ ] **2.1** 实现 `export_png(image_data, output_path)`：
  - 接收 Base64 编码的 PNG 数据
  - 解码 → 写入文件
  - 文件扩展名自动补充 .png
- [ ] **2.2** 输出路径不存在时自动创建父目录
- [ ] **2.3** 测试：传入有效 Base64 → 输出 PNG 文件可被图片查看器打开

### 3. 批量导出

- [ ] **3.1** 定义 `ExportTask` / `ExportTaskResult` dataclass
- [ ] **3.2** 实现 `export_multiple(tasks: list[ExportTask]) -> list[ExportTaskResult]`：
  - 每个 task 独立执行 → 单个失败不影响其他
  - 返回每个 task 的结果（含错误信息）
- [ ] **3.3** 测试：3 个 task，第 2 个路径无效 → 返回 [成功, 失败, 成功]

### 4. 输出路径管理

- [ ] **4.1** 默认导出到项目 `exports/` 子目录
- [ ] **4.2** 文件名默认格式：`<diagram_name>_<timestamp>.<format>`
- [ ] **4.3** 同名文件覆盖前提示（通过 API 返回确认需求）
- [ ] **4.4** 测试：默认路径生成正确

---

> **完成标准**: SVG 和 PNG 导出可用，批量导出中单失败不影响其他
