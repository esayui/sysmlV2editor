// ===========================================================================
// Canvas Slice — 画布模型状态管理
// 来源: 详细设计 §3.8
// ===========================================================================

import type { StateCreator } from 'zustand';
import type {
  DiagramNode,
  DiagramEdge,
  Point,
  NodeStyle,
} from '@/types/canvas-model';
import type { AppStore, CanvasSlice } from '../types';

/** 创建空的 CanvasModel */
function createEmptyCanvasModel() {
  return {
    semanticModelId: '',
    diagrams: [],
  };
}

export const createCanvasSlice: StateCreator<
  AppStore,
  [],
  [],
  CanvasSlice
> = (set) => ({
  canvasModel: createEmptyCanvasModel(),
  activeDiagramId: null,

  addDiagram: (diagram) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: [...state.canvasModel.diagrams, diagram],
      },
      activeDiagramId: diagram.id,
      isDirty: true,
    })),

  setActiveDiagram: (diagramId) =>
    set({ activeDiagramId: diagramId }),

  closeDiagram: (diagramId) =>
    set((state) => {
      const diagrams = state.canvasModel.diagrams.map((d) =>
        d.id === diagramId ? { ...d, isOpen: false } : d,
      );
      const openDiagrams = diagrams.filter((d) => d.isOpen);
      return {
        canvasModel: { ...state.canvasModel, diagrams },
        activeDiagramId:
          state.activeDiagramId === diagramId
            ? (openDiagrams.length > 0 ? openDiagrams[0].id : null)
            : state.activeDiagramId,
        isDirty: true,
      };
    }),

  openDiagram: (diagramId) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) =>
          d.id === diagramId ? { ...d, isOpen: true } : d,
        ),
      },
      activeDiagramId: diagramId,
      isDirty: true,
    })),

  removeDiagram: (diagramId) =>
    set((state) => {
      const remaining = state.canvasModel.diagrams.filter((d) => d.id !== diagramId);
      return {
        canvasModel: { ...state.canvasModel, diagrams: remaining },
        activeDiagramId:
          state.activeDiagramId === diagramId
            ? (remaining.length > 0 ? remaining[0].id : null)
            : state.activeDiagramId,
        isDirty: true,
      };
    }),

  addNodeToDiagram: (diagramId: string, node: DiagramNode) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) =>
          d.id === diagramId
            ? { ...d, nodes: [...d.nodes, node] }
            : d,
        ),
      },
      isDirty: true,
    })),

  updateNodePosition: (nodeId: string, x: number, y: number) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) => ({
          ...d,
          nodes: d.nodes.map((n) =>
            n.id === nodeId ? { ...n, x, y } : n,
          ),
        })),
      },
      isDirty: true,
    })),

  updateNodeStyle: (nodeId: string, style: Partial<NodeStyle>) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) => ({
          ...d,
          nodes: d.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, style: { ...n.style, ...style } }
              : n,
          ),
        })),
      },
      isDirty: true,
    })),

  removeNodeFromDiagram: (diagramId: string, nodeId: string) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) =>
          d.id === diagramId
            ? { ...d, nodes: d.nodes.filter((n) => n.id !== nodeId) }
            : d,
        ),
      },
      isDirty: true,
    })),

  addEdgeToDiagram: (diagramId: string, edge: DiagramEdge) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) =>
          d.id === diagramId
            ? { ...d, edges: [...d.edges, edge] }
            : d,
        ),
      },
      isDirty: true,
    })),

  updateEdgeWaypoints: (edgeId: string, waypoints: Point[]) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) => ({
          ...d,
          edges: d.edges.map((e) =>
            e.id === edgeId ? { ...e, waypoints } : e,
          ),
        })),
      },
      isDirty: true,
    })),

  removeEdgeFromDiagram: (diagramId: string, edgeId: string) =>
    set((state) => ({
      canvasModel: {
        ...state.canvasModel,
        diagrams: state.canvasModel.diagrams.map((d) =>
          d.id === diagramId
            ? { ...d, edges: d.edges.filter((e) => e.id !== edgeId) }
            : d,
        ),
      },
      isDirty: true,
    })),
});
