// ===========================================================================
// Toolbox Panel — 左侧工具箱面板
// 来源: 详细设计 §3.5
// 依赖: M-FE-01 (Canvas Engine), M-FE-04 (Interaction Handler), M-FE-08 (State Store)
// ===========================================================================

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import useStore from '@/store';
import { defaultToolboxItems, filterToolboxByDiagram } from './toolbox-data';
import { getToolboxIcon } from './icons';
import type { ToolboxCategory, ToolboxItem } from './types';
import './toolbox-panel.css';

// ===========================================================================
// 快捷键映射
// ===========================================================================

/** 键盘按键 → 工具箱条目 ID */
const KEYBOARD_SHORTCUT_MAP: Record<
  string,
  { itemId: string }
> = {
  'b': { itemId: 'part-def' },
  'B': { itemId: 'part-usage' },
  'p': { itemId: 'port-def' },
  'P': { itemId: 'port-usage' },
  'r': { itemId: 'requirement-def' },
  'c': { itemId: 'connection' },
};

// ===========================================================================
// 组件
// ===========================================================================

export function ToolboxPanel(): React.ReactElement {
  // ---- Store ----
  const filterText = useStore((s) => s.toolboxFilter);
  const setFilterText = useStore((s) => s.setToolboxFilter);
  const setInteractionMode = useStore((s) => s.setInteractionMode);
  const setActiveToolboxElementType = useStore((s) => s.setActiveToolboxElementType);
  const activeDiagramId = useStore((s) => s.activeDiagramId);
  const canvasModel = useStore((s) => s.canvasModel);
  const activeDiagramType = canvasModel.diagrams.find((d) => d.id === activeDiagramId)?.type ?? null;

  // ---- Local State ----
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () =>
      new Set(
        defaultToolboxItems
          .filter((c) => c.expanded)
          .map((c) => c.id),
      ),
  );

  // Track dragging for visual feedback
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  // Ref to avoid stale closures in keyboard handler
  const selectedItemIdRef = useRef<string | null>(null);
  selectedItemIdRef.current = selectedItemId;

  // =========================================================================
  // 搜索过滤
  // =========================================================================

  /**
   * 根据搜索文本过滤分类和条目。
   * 匹配中文 label 和英文 englishLabel。
   */
  const filteredCategories = useMemo((): ToolboxCategory[] => {
    // 先根据活跃图类型过滤
    const base = filterToolboxByDiagram(defaultToolboxItems, activeDiagramType);
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return base;
    }

    return base
      .map((category) => {
        const filteredItems = category.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.englishLabel.toLowerCase().includes(query),
        );
        return { ...category, items: filteredItems };
      })
      .filter((category) => category.items.length > 0);
  }, [filterText]);

  // 搜索时自动展开所有分类
  useEffect(() => {
    if (filterText.trim()) {
      setExpandedCategories(
        new Set(defaultToolboxItems.map((c) => c.id)),
      );
    }
  }, [filterText]);

  // =========================================================================
  // 键盘快捷键
  // =========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // 不在输入框中才处理快捷键
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button'
      ) {
        return;
      }

      // Escape → 取消选中
      if (e.key === 'Escape') {
        setSelectedItemId(null);
        setInteractionMode('select');
        return;
      }

      // 不处理带修饰键的组合键（Ctrl/Cmd/Meta/Alt，但允许 Shift）
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // 查找快捷键映射
      const shortcut = KEYBOARD_SHORTCUT_MAP[e.key];
      if (!shortcut) return;

      e.preventDefault();

      // 在 defaultToolboxItems 中查找对应条目
      for (const cat of defaultToolboxItems) {
        const item = cat.items.find((i) => i.id === shortcut.itemId);
        if (item) {
          setSelectedItemId(item.id);
          setInteractionMode('create-block');
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setInteractionMode]);

  // =========================================================================
  // Click: 选中 / 取消选中
  // =========================================================================

  const handleItemClick = useCallback(
    (item: ToolboxItem): void => {
      if (selectedItemId === item.id) {
        // 再次点击 → 取消选中
        setSelectedItemId(null);
        setInteractionMode('select');
        setActiveToolboxElementType(null);
      } else {
        // 选中
        setSelectedItemId(item.id);
        setInteractionMode('create-block');
        setActiveToolboxElementType(item.elementType);
      }
    },
    [selectedItemId, setInteractionMode, setActiveToolboxElementType],
  );

  // =========================================================================
  // Drag: 设置 dataTransfer
  // =========================================================================

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, item: ToolboxItem): void => {
      // 设置自定义 MIME type（interaction-handler 优先读取）
      e.dataTransfer.setData(
        'application/sysml2-element-type',
        item.elementType,
      );
      // 降级方案：text/plain
      e.dataTransfer.setData('text/plain', item.elementType);
      e.dataTransfer.effectAllowed = 'copy';

      setDraggingItemId(item.id);
    },
    [],
  );

  const handleDragEnd = useCallback((): void => {
    setDraggingItemId(null);
  }, []);

  // =========================================================================
  // Category: 展开 / 折叠
  // =========================================================================

  const toggleCategory = useCallback(
    (categoryId: string): void => {
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
        return next;
      });
    },
    [],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="toolbox-panel">
      {/* ---- Search ---- */}
      <div className="toolbox-search">
        <input
          type="text"
          className="toolbox-search-input"
          placeholder="搜索元素..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label="搜索工具箱元素"
        />
      </div>

      {/* ---- Categories ---- */}
      <div className="toolbox-categories">
        {filteredCategories.length === 0 ? (
          <div className="toolbox-empty">
            无匹配元素
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} className="toolbox-category">
              {/* Category Header */}
              <div
                className="toolbox-category-header"
                onClick={() => toggleCategory(category.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCategory(category.id);
                  }
                }}
                aria-expanded={expandedCategories.has(category.id)}
              >
                <span className="toolbox-category-arrow">
                  {expandedCategories.has(category.id) ? '▼' : '▶'}
                </span>
                <span className="toolbox-category-label">
                  {category.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: '#bbb',
                    marginLeft: 4,
                  }}
                >
                  ({category.items.length})
                </span>
              </div>

              {/* Items */}
              {expandedCategories.has(category.id) && (
                <div className="toolbox-category-items">
                  {category.items.map((item) => (
                    <div
                      key={item.id}
                      className={[
                        'toolbox-item',
                        selectedItemId === item.id ? 'selected' : '',
                        draggingItemId === item.id ? 'dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleItemClick(item)}
                      title={`${item.label} (${item.englishLabel})${
                        item.hotkey ? ` [${item.hotkey}]` : ''
                      }`}
                      role="listitem"
                    >
                      <span className="toolbox-item-icon">
                        {getToolboxIcon(item.elementType, category.id)}
                      </span>
                      <span className="toolbox-item-label">
                        {item.label}
                      </span>
                      {item.hotkey && (
                        <span className="toolbox-item-hotkey">
                          {item.hotkey}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ToolboxPanel;
