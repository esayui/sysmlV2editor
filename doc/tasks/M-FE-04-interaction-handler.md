# M-FE-04: Interaction Handler（交互处理器）

> **详细设计**: §3.4
> **依赖**: M-FE-01（Canvas Engine）, M-FE-08（State Store — interactionMode）
> **目标**: 鼠标/键盘事件 → 操作意图（Intent），模式切换管理

---

## 任务清单

### 1. 模式管理

- [x] **1.1** 实现 `InteractionMode` 类型：select | pan | connect | create-block | create-port | delete
- [x] **1.2** 实现 `setMode(mode)`：切换当前模式，更新光标样式（select=default, pan=grab, connect=crosshair, ...）
- [x] **1.3** 实现 `getMode()`：返回当前模式
- [x] **1.4** 测试：setMode('connect') 后 getMode() === 'connect'，光标变为 crosshair

### 2. 鼠标事件 → Intent

- [x] **2.1** select 模式下的 mouse:down → 判断点击对象类型，翻译为 element:click / port:click / canvas:click
- [x] **2.2** select 模式下的 mouse:move（拖拽）→ element:drag-start → element:drag-move → element:drag-end
- [x] **2.3** select 模式下的框选（Shift+拖拽空白）→ selection:box → selection:clear
- [x] **2.4** connect 模式下：点击端口 → port:connect-start，拖拽到另一端口 → port:connect-end
- [x] **2.5** pan 模式下（空格键按住+拖拽）→ 不产生 Intent，直接调 CanvasEngine.pan()
- [x] **2.6** delete 模式下：点击元素 → element:delete
- [x] **2.7** 测试：在 select 模式下点击 Block → 触发 element:click 回调；拖拽 → 触发三阶段回调

### 3. 键盘事件 → Intent

- [x] **3.1** Ctrl+Z → keyboard:undo
- [x] **3.2** Ctrl+Y / Ctrl+Shift+Z → keyboard:redo
- [x] **3.3** Delete / Backspace → keyboard:delete
- [x] **3.4** Ctrl+C / Ctrl+V → keyboard:copy / keyboard:paste
- [x] **3.5** Ctrl+A → keyboard:select-all
- [x] **3.6** 空格键（按住）→ 切换到 pan 模式；释放 → 恢复原模式
- [x] **3.7** Escape → 取消当前操作 / 清空选择
- [x] **3.8** 测试：按 Delete → keyboard:delete 回调触发

### 4. 拖放（从 Toolbox）

- [x] **4.1** 监听 Canvas 上的 `drop` 事件 → drop:from-toolbox
- [x] **4.2** 从 drop 事件的 dataTransfer 中提取 elementType 和拖放位置
- [x] **4.3** 测试：拖拽 Toolbox item 到画布，回调收到正确的 elementType 和坐标

### 5. Intent 回调机制

- [x] **5.1** 实现 `onIntent(intent, callback)` / `offIntent(intent, callback)` 注册/注销
- [x] **5.2** 实现 `dispatchIntent(intent, payload)`：触发所有注册的 callback
- [x] **5.3** 测试：注册两个 handler 到 element:click，点击后两个都被调用

---

> **完成标准**: 六种模式正确切换；鼠标和键盘操作产生正确的 Intent；从 Toolbox 拖放到画布能传递 elementType 和坐标
