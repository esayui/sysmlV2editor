import { useEffect, useRef, useState, useCallback } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { healthCheck } from './api/client';
import ProjectPage from './components/ProjectPage';
import { ToolboxPanel } from './panels/toolbox';
import { PropertiesPanel } from './panels/properties';
import { ModelTreePanel } from './panels/tree/model-tree-panel';
import { useCanvasEngine } from './canvas/canvas-engine';
import { DEFAULT_CANVAS_CONFIG } from './types/canvas-model';
import { InteractionHandler } from './canvas/interactions/interaction-handler';
import type { IntentCallback } from './canvas/interactions/interaction-handler';
import { globalRegistry } from './canvas/elements/renderer-registry';
import { registerAllRenderers } from './canvas/elements';
import useStore from './store';
import type { SemanticElement, ElementType } from './types/semantic-model';
import type { DiagramNode } from './types/canvas-model';
import './App.css';

function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ModelingPage({ projectName, onBack }: { projectName: string; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useCanvasEngine(canvasRef, DEFAULT_CANVAS_CONFIG);
  const interactionRef = useRef<InteractionHandler | null>(null);
  const dropCallbackRef = useRef<IntentCallback | null>(null);

  const addElement = useStore((s) => s.addElement);
  const addNodeToDiagram = useStore((s) => s.addNodeToDiagram);
  const closeDiagram = useStore((s) => s.closeDiagram);
  const semanticModel = useStore((s) => s.semanticModel);
  const canvasModel = useStore((s) => s.canvasModel);
  const activeDiagramId = useStore((s) => s.activeDiagramId);
  const activeDiagram = canvasModel.diagrams.find((d) => d.id === activeDiagramId);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  // 图图标映射
  const DIAGRAM_ICONS: Record<string, string> = {
    BDD: '▣', IBD: '◈', PKG: '📁', PAR: '𝑓', REQ: '🛡',
    ACT: '⚡', STM: '◎', SD: '↔', UC: '👤',
  };
  const DIAGRAM_NAMES: Record<string, string> = {
    BDD: '块定义图', IBD: '内部块图', PKG: '包图', PAR: '参数图',
    REQ: '需求图', ACT: '活动图', STM: '状态机图', SD: '序列图', UC: '用例图',
  };

  // 根据活跃视图确定新元素的归属
  const getParentElementId = (): string | null => {
    const activeDId = useStore.getState().activeDiagramId;
    if (!activeDId) return null;
    const diagrams = useStore.getState().canvasModel.diagrams;
    return diagrams.find((d) => d.id === activeDId)?.ownerElementId ?? null;
  };

  // 当删除元素时清理其拥有的视图；当活跃视图被删除时切换到其他视图
  useEffect(() => {
    const existingElIds = new Set(semanticModel.elements.map((e) => e.id));
    const orphanDiagrams = canvasModel.diagrams.filter(
      (d) => d.ownerElementId && !existingElIds.has(d.ownerElementId),
    );
    if (orphanDiagrams.length > 0) {
      const orphanIds = new Set(orphanDiagrams.map((d) => d.id));
      const remaining = canvasModel.diagrams.filter((d) => !orphanIds.has(d.id));
      useStore.setState({
        canvasModel: { ...canvasModel, diagrams: remaining },
        activeDiagramId: remaining.length > 0 ? remaining[0].id : null,
      });
    }
  }, [semanticModel.elements, canvasModel.diagrams]);

  // 初始化模型树根 Package
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    const rootPkg = semanticModel.elements.find(
      (e) => e.type === 'Package' && e.ownerId === null,
    );
    if (!rootPkg) {
      const pkgId = genId();
      const rootPkgElement: SemanticElement = {
        id: pkgId,
        name: projectName,
        qualifiedName: projectName,
        type: 'Package',
        ownerId: null,
        description: `Root package for project ${projectName}`,
        properties: {},
      };
      useStore.getState().addElement(rootPkgElement);
    }
    const rootPkgId = useStore.getState().semanticModel.elements.find(
      (e) => e.type === 'Package' && e.ownerId === null,
    )?.id ?? '';
    if (canvasModel.diagrams.length === 0) {
      useStore.setState({
        canvasModel: {
          ...canvasModel,
          diagrams: [
            {
              id: genId(),
              name: 'Main BDD',
              type: 'BDD',
              ownerElementId: rootPkgId,
              isOpen: true,
              nodes: [],
              edges: [],
              viewport: { zoom: 1, panX: 0, panY: 0 },
              createdAt: new Date().toISOString(),
              modifiedAt: new Date().toISOString(),
            },
          ],
        },
        activeDiagramId: canvasModel.diagrams[0]?.id ?? null,
      });
    }
    initialized.current = true;
  }, []);

  // 初始化 InteractionHandler + Renderer Registration
  useEffect(() => {
    if (!engine || interactionRef.current) return;
    registerAllRenderers(engine);
    const handler = new InteractionHandler(engine);
    handler.initialize();
    interactionRef.current = handler;

    const callback: IntentCallback = (payload) => {
      const elementType = payload.elementType as ElementType;
      const pos = payload.dropPosition;
      if (!elementType || !pos) return;

      const elemId = genId();
      const newElement: SemanticElement = {
        id: elemId,
        name: elementType,
        qualifiedName: `${projectName}::${elementType}`,
        type: elementType,
        ownerId: getParentElementId(),
        description: '',
        properties: {},
      };
      addElement(newElement);

      const activeDiagramId = useStore.getState().activeDiagramId;
      if (activeDiagramId && globalRegistry) {
        try {
          const fObj = globalRegistry.createCanvasObject(newElement, pos);
          if (fObj) {
            const node: DiagramNode = {
              id: `canvas_node:${elemId}`,
              semanticElementId: elemId,
              x: pos.x, y: pos.y,
              width: fObj.width ?? 160, height: fObj.height ?? 80,
              style: { fillColor: '#FFFFFF', strokeColor: '#333333', strokeWidth: 2, fontSize: 14, fontFamily: 'sans-serif', fontColor: '#333333', opacity: 1, borderRadius: 8, showShadow: false },
              collapsed: false, zIndex: 0, locked: false,
            };
            addNodeToDiagram(activeDiagramId, node);
            engine.addObject(fObj);
            console.log('[drop] Created', elementType, 'at', pos);
          }
        } catch (err) { console.error('[drop] render error:', err); }
      }
    };

    handler.onIntent('drop:from-toolbox', callback);
    dropCallbackRef.current = callback;

    // canvas:click → click-to-place (工具箱选中后点击画布放置)
    const clickCallback: IntentCallback = (payload) => {
      const elemType = useStore.getState().activeToolboxElementType;
      if (!elemType) return;
      const pos = payload.scenePoint || payload.viewportPoint;
      if (!pos) return;

      // 获取活跃视图的所属元素 ID，新建元素放在该元素下
      const activeDId = useStore.getState().activeDiagramId;
      const diagrams = useStore.getState().canvasModel.diagrams;
      const activeDiag = diagrams.find((d) => d.id === activeDId);
      const parentElementId = activeDiag?.ownerElementId ?? null;

      const elemId = genId();
      const newElement: SemanticElement = {
        id: elemId, name: elemType,
        qualifiedName: `${projectName}::${elemType}`,
        type: elemType as ElementType, ownerId: parentElementId, description: '', properties: {},
      };
      addElement(newElement);
      if (activeDId && globalRegistry && engineRef.current) {
        try {
          const fObj = globalRegistry.createCanvasObject(newElement, pos);
          if (fObj) {
            const node: DiagramNode = {
              id: `canvas_node:${elemId}`, semanticElementId: elemId,
              x: pos.x, y: pos.y, width: fObj.width ?? 160, height: fObj.height ?? 80,
              style: { fillColor: '#FFFFFF', strokeColor: '#333333', strokeWidth: 2, fontSize: 14, fontFamily: 'sans-serif', fontColor: '#333333', opacity: 1, borderRadius: 8, showShadow: false },
              collapsed: false, zIndex: 0, locked: false,
            };
            addNodeToDiagram(activeDId, node);
            engineRef.current.addObject(fObj);
            console.log('[canvas:click] Created', elemType, 'at', pos, 'owner:', parentElementId);
          }
        } catch (err) { console.error('[canvas:click] render error:', err); }
      }
    };
    handler.onIntent('canvas:click', clickCallback);

    return () => {
      if (dropCallbackRef.current) handler.offIntent('drop:from-toolbox', dropCallbackRef.current);
      handler.offIntent('canvas:click', clickCallback);
      handler.destroy();
      interactionRef.current = null;
    };
  }, [engine]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      const elementType =
        dt.getData('application/sysml2-element-type') || dt.getData('text/plain');
      if (!elementType || !engine) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const parentElId = getParentElementId();
      const elemId = genId();
      const newElement: SemanticElement = {
        id: elemId,
        name: elementType,
        qualifiedName: `${projectName}::${elementType}`,
        type: elementType as ElementType,
        ownerId: parentElId,
        description: '',
        properties: {},
      };
      addElement(newElement);

      const activeDiagramId = useStore.getState().activeDiagramId;
      if (activeDiagramId && globalRegistry) {
        try {
          const fObj = globalRegistry.createCanvasObject(newElement, pos);
          if (fObj) {
            const node: DiagramNode = {
              id: `canvas_node:${elemId}`,
              semanticElementId: elemId,
              x: pos.x, y: pos.y,
              width: fObj.width ?? 160, height: fObj.height ?? 80,
              style: { fillColor: '#FFFFFF', strokeColor: '#333333', strokeWidth: 2, fontSize: 14, fontFamily: 'sans-serif', fontColor: '#333333', opacity: 1, borderRadius: 8, showShadow: false },
              collapsed: false, zIndex: 0, locked: false,
            };
            addNodeToDiagram(activeDiagramId, node);
            engine.addObject(fObj);
            console.log('[handleDrop] Created', elementType, 'at', pos);
          }
        } catch (err) { console.error('[handleDrop] render error:', err); }
      }
    },
    [engine, projectName, addElement, addNodeToDiagram],
  );

  return (
    <div className="app-shell">
      <aside className="panel panel-left" id="left-panel">
        <div className="toolbox-panel">
          <ToolboxPanel />
        </div>
        <div className="model-tree-panel">
          <ModelTreePanel />
        </div>
      </aside>

      <main
        className="panel panel-center"
        id="canvas-panel"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 图标签栏 */}
        <div className="diagram-tabs-bar">
          <button className="back-button" onClick={onBack} title="返回工程管理">
            ← 返回
          </button>
          {canvasModel.diagrams.filter((d) => d.isOpen !== false).map((d) => (
            <div
              key={d.id}
              className={`diagram-tab${d.id === activeDiagramId ? ' active' : ''}`}
              onClick={() => useStore.setState({ activeDiagramId: d.id })}
            >
              <span className="diagram-tab-icon">{DIAGRAM_ICONS[d.type] ?? '📊'}</span>
              <span className="diagram-tab-label">{DIAGRAM_NAMES[d.type] ?? d.type}</span>
              <span className="diagram-tab-name">{d.name}</span>
              <span
                className="diagram-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeDiagram(d.id);
                }}
                title="关闭视图"
              >×</span>
            </div>
          ))}
          {activeDiagram && (
            <span className="diagram-active-hint">
              当前: {DIAGRAM_NAMES[activeDiagram.type] ?? activeDiagram.type} — 工具箱已过滤
            </span>
          )}
        </div>
        <canvas className="fabric-wrapper" ref={canvasRef} />
        {!engine && (
          <div className="canvas-placeholder">
            <div className="canvas-hint">
              <span className="canvas-icon">&#x1F4D0;</span>
              <p>画布加载中...</p>
            </div>
          </div>
        )}
      </main>

      <aside className="panel panel-right" id="properties-panel">
        <PropertiesPanel />
      </aside>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<'project' | 'modeling'>('project');
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    healthCheck()
      .then((data) => console.log('Backend connected:', data))
      .catch((err) => console.error('Backend connection failed:', err.message));
  }, []);

  const handleEnterProject = (name: string, _path: string) => {
    setProjectName(name);
    setView('modeling');
  };

  return (
    <ConfigProvider locale={zhCN}>
      {view === 'project' ? (
        <ProjectPage onEnterProject={handleEnterProject} />
      ) : (
        <ModelingPage projectName={projectName} onBack={() => setView('project')} />
      )}
    </ConfigProvider>
  );
}
