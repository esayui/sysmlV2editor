// ===========================================================================
// Connection Manager -- 连线管理器
// 来源: 详细设计 SS3.3
// ===========================================================================

import {
  Group,
  Polyline,
  Triangle,
  Text,
  FabricObject,
} from 'fabric';
import type { XY } from 'fabric';
import type { ICanvasEngine } from '../canvas-engine';
import type { Point, Rect, EdgeStyle, ArrowType } from '@/types/canvas-model';
import type { RelationshipType } from '@/types/semantic-model';
import { RELATIONSHIP_STYLE_MAP } from '@/types/semantic-model';

// ===========================================================================
// 内部类型
// ===========================================================================

/** 连线上存储的自定义元数据 */
interface ConnectionMeta {
  /** 连线唯一标识 */
  id: string;
  /** 源端元素/端口 ID */
  sourceId: string;
  /** 目标端元素/端口 ID */
  targetId: string;
  /** 关系类型 */
  type: RelationshipType;
  /** 标识此为连线对象 */
  connectionType: 'edge';
  /** 当前路径点 */
  waypoints: Point[];
}

/** 具有自定义 data 属性的 FabricObject */
interface ObjectWithData extends FabricObject {
  data?: Record<string, unknown>;
}

// ===========================================================================
// IConnectionManager 接口
// ===========================================================================

export interface IConnectionManager {
  /** 创建连线 */
  createConnection(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    style?: EdgeStyle,
  ): FabricObject;

  /** 删除连线 */
  removeConnection(connectionId: string): void;

  /** 计算路径（直角正交路由） */
  calculatePath(
    sourcePoint: Point,
    targetPoint: Point,
    obstacles: Rect[],
  ): Point[];

  /** 元素移动后更新所有关联连线 */
  updatePathsForElement(elementId: string): void;

  /** 应用关系类型的默认样式 */
  applyRelationshipStyle(connectionId: string, type: RelationshipType): void;

  /** 获取与指定元素相关的所有连线 */
  getConnectionsForElement(elementId: string): FabricObject[];

  /** 按 ID 查找连线 */
  getConnectionById(id: string): FabricObject | null;
}

// ===========================================================================
// 辅助函数
// ===========================================================================

/** 将 RELATIONSHIP_STYLE_MAP 的条目转换为 EdgeStyle */
function getDefaultStyle(type: RelationshipType): EdgeStyle {
  const raw = RELATIONSHIP_STYLE_MAP[type];
  return {
    strokeColor: raw.strokeColor,
    strokeWidth: raw.strokeWidth,
    dashPattern: raw.dashPattern,
    startArrow: raw.startArrow as ArrowType,
    endArrow: raw.endArrow as ArrowType,
    lineType: raw.lineType,
  };
}

/** 两点间欧几里得距离 */
function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** 获取 FabricObject 的自定义 data */
function getObjectData(obj: FabricObject): Record<string, unknown> | undefined {
  return (obj as ObjectWithData).data;
}

/** 从 FabricObject 的包围盒计算锚点 */
function getAnchorPoints(obj: FabricObject): Point[] {
  const rect = obj.getBoundingRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  return [
    { x: cx, y: rect.top },                      // top
    { x: rect.left + rect.width, y: cy },         // right
    { x: cx, y: rect.top + rect.height },          // bottom
    { x: rect.left, y: cy },                       // left
    { x: cx, y: cy },                              // center
  ];
}

/** 从锚点列表中找离目标点最近的锚点 */
function findClosestAnchor(anchors: Point[], target: Point): Point {
  let best = anchors[0];
  let bestDist = Infinity;
  for (const a of anchors) {
    const d = distance(a, target);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

/** 线段与矩形是否相交（含间距 padding） */
function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  rect: Rect,
  padding: number,
): boolean {
  const r = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  // 快速排除：线段两端都在矩形同侧
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  if (maxX <= r.x || minX >= r.x + r.width) return false;
  if (maxY <= r.y || minY >= r.y + r.height) return false;

  // 线段完全在矩形内
  if (minX >= r.x && maxX <= r.x + r.width &&
      minY >= r.y && maxY <= r.y + r.height) {
    return true;
  }

  // 水平/垂直线段的快速检测
  if (p1.x === p2.x) {
    if (p1.x > r.x && p1.x < r.x + r.width) {
      return (p1.y <= r.y + r.height && p2.y >= r.y) ||
             (p2.y <= r.y + r.height && p1.y >= r.y);
    }
    return false;
  }

  if (p1.y === p2.y) {
    if (p1.y > r.y && p1.y < r.y + r.height) {
      return (p1.x <= r.x + r.width && p2.x >= r.x) ||
             (p2.x <= r.x + r.width && p1.x >= r.x);
    }
    return false;
  }

  return segmentRectIntersectGeneral(p1, p2, r);
}

/** 一般情况的线段-矩形相交检测 */
function segmentRectIntersectGeneral(
  p1: Point,
  p2: Point,
  r: { x: number; y: number; width: number; height: number },
): boolean {
  const edges: [Point, Point][] = [
    [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }],
    [{ x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }],
    [{ x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }],
    [{ x: r.x, y: r.y + r.height }, { x: r.x, y: r.y }],
  ];

  for (const [e1, e2] of edges) {
    if (segmentsIntersect(p1, p2, e1, e2)) return true;
  }

  if (p1.x >= r.x && p1.x <= r.x + r.width &&
      p1.y >= r.y && p1.y <= r.y + r.height) return true;
  if (p2.x >= r.x && p2.x <= r.x + r.width &&
      p2.y >= r.y && p2.y <= r.y + r.height) return true;

  return false;
}

/** 两条线段是否相交 */
function segmentsIntersect(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;

  return false;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
         Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

/** 检查路径是否与任何障碍物相交 */
function pathIntersectsObstacles(
  waypoints: Point[],
  obstacles: Rect[],
): boolean {
  for (let i = 0; i < waypoints.length - 1; i++) {
    for (const obs of obstacles) {
      if (segmentIntersectsRect(waypoints[i], waypoints[i + 1], obs, 4)) {
        return true;
      }
    }
  }
  return false;
}

/** 从一组方向尝试绕开障碍物 */
function tryDetour(
  source: Point,
  target: Point,
  obstacles: Rect[],
): Point[] {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  const candidates: Point[][] = [
    // 水平优先
    [source, { x: target.x, y: source.y }, target],
    // 垂直优先
    [source, { x: source.x, y: target.y }, target],
    // 通过中点
    [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target],
    [source, { x: source.x, y: midY }, { x: target.x, y: midY }, target],
  ];

  for (const path of candidates) {
    if (!pathIntersectsObstacles(path, obstacles)) {
      return simplifyPath(path);
    }
  }

  return detourAroundObstacles(source, target, obstacles);
}

/** 围绕障碍物的绕行路径 */
function detourAroundObstacles(
  source: Point,
  target: Point,
  obstacles: Rect[],
): Point[] {
  const waypoints: Point[] = [source];
  let current = source;

  for (const obs of obstacles) {
    const expanded = {
      x: obs.x - 8,
      y: obs.y - 8,
      width: obs.width + 16,
      height: obs.height + 16,
    };

    if (current.x < expanded.x && target.x > expanded.x + expanded.width) {
      const above: Point = { x: current.x, y: expanded.y - 10 };
      const below: Point = { x: current.x, y: expanded.y + expanded.height + 10 };

      const abovePath: Point[] = [
        current, above,
        { x: target.x, y: above.y },
        { x: target.x, y: target.y },
      ];
      const belowPath: Point[] = [
        current, below,
        { x: target.x, y: below.y },
        { x: target.x, y: target.y },
      ];

      if (!pathIntersectsObstacles(abovePath, obstacles)) {
        waypoints.push(above, { x: target.x, y: above.y });
        current = { x: target.x, y: above.y };
      } else if (!pathIntersectsObstacles(belowPath, obstacles)) {
        waypoints.push(below, { x: target.x, y: below.y });
        current = { x: target.x, y: below.y };
      } else {
        waypoints.push(above);
        current = above;
      }
    } else if (current.y < expanded.y && target.y > expanded.y + expanded.height) {
      const left: Point = { x: expanded.x - 10, y: current.y };
      const right: Point = { x: expanded.x + expanded.width + 10, y: current.y };

      const leftPath: Point[] = [
        current, left,
        { x: left.x, y: target.y },
        { x: target.x, y: target.y },
      ];
      const rightPath: Point[] = [
        current, right,
        { x: right.x, y: target.y },
        { x: target.x, y: target.y },
      ];

      if (!pathIntersectsObstacles(leftPath, obstacles)) {
        waypoints.push(left, { x: left.x, y: target.y });
        current = { x: left.x, y: target.y };
      } else if (!pathIntersectsObstacles(rightPath, obstacles)) {
        waypoints.push(right, { x: right.x, y: target.y });
        current = { x: right.x, y: target.y };
      } else {
        waypoints.push(left);
        current = left;
      }
    }
  }

  waypoints.push(target);
  return simplifyPath(waypoints);
}

/** 移除共线的中间路径点 */
function simplifyPath(waypoints: Point[]): Point[] {
  if (waypoints.length <= 2) return [...waypoints];

  const result: Point[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;

    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

/** 生成二次贝塞尔曲线路径点 */
function generateCurvedPath(
  source: Point,
  target: Point,
): Point[] {
  const cx = (source.x + target.x) / 2;
  const cy = Math.min(source.y, target.y) - Math.abs(target.x - source.x) * 0.2;
  const controlPoint: Point = { x: cx, y: cy };

  const segments = 16;
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (1 - t) * (1 - t) * source.x +
              2 * (1 - t) * t * controlPoint.x +
              t * t * target.x;
    const y = (1 - t) * (1 - t) * source.y +
              2 * (1 - t) * t * controlPoint.y +
              t * t * target.y;
    points.push({ x, y });
  }
  return points;
}

/** 计算线段方向角度（度） */
function segmentAngle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
}

// ===========================================================================
// ConnectionManager 实现
// ===========================================================================

export class ConnectionManager implements IConnectionManager {
  private canvas: ICanvasEngine;

  /** 连线 ID -> Group 的映射 */
  private connections: Map<string, Group> = new Map();

  /** 连线元数据 */
  private connectionMeta: Map<string, ConnectionMeta> = new Map();

  /** 连线 ID 计数器 */
  private idCounter = 0;

  /** 外部障碍物提供者 */
  private obstacleProvider: (() => Rect[]) | null = null;

  constructor(canvas: ICanvasEngine) {
    this.canvas = canvas;
  }

  /**
   * 设置障碍物提供者。
   * 在完整应用中由 Store/Engine 集成代码调用，
   * 以获取画布上所有元素的包围盒。
   */
  setObstacleProvider(provider: () => Rect[]): void {
    this.obstacleProvider = provider;
  }

  // =========================================================================
  // 连线生命周期
  // =========================================================================

  createConnection(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    style?: EdgeStyle,
  ): FabricObject {
    const sourceObj = this.canvas.getObjectById(sourceId);
    const targetObj = this.canvas.getObjectById(targetId);

    if (!sourceObj) {
      throw new Error(`Source object not found: ${sourceId}`);
    }
    if (!targetObj) {
      throw new Error(`Target object not found: ${targetId}`);
    }

    // 获取端点锚点
    const sourceAnchors = getAnchorPoints(sourceObj);
    const targetAnchors = getAnchorPoints(targetObj);

    const sourceCenter = sourceAnchors[4];
    const targetCenter = targetAnchors[4];

    const sourcePoint = findClosestAnchor(
      sourceAnchors.slice(0, 4),
      targetCenter,
    );
    const targetPoint = findClosestAnchor(
      targetAnchors.slice(0, 4),
      sourceCenter,
    );

    // 应用样式
    const edgeStyle = style ?? getDefaultStyle(type);

    // 计算障碍物列表
    const obstacles = this.collectObstacles(sourceId, targetId);

    // 生成路径
    let waypoints: Point[];
    switch (edgeStyle.lineType) {
      case 'curved':
        waypoints = generateCurvedPath(sourcePoint, targetPoint);
        break;
      case 'straight':
        waypoints = [sourcePoint, targetPoint];
        break;
      case 'orthogonal':
      default:
        waypoints = this.calculatePath(sourcePoint, targetPoint, obstacles);
        break;
    }

    // 生成连线 ID
    const connectionId = `conn-${++this.idCounter}`;

    // 创建连线组
    const connectionGroup = this.buildConnectionGroup(
      connectionId,
      waypoints,
      edgeStyle,
      type,
      sourceId,
      targetId,
    );

    // 添加到画布
    this.canvas.addObject(connectionGroup);

    // 存储内部状态
    this.connections.set(connectionId, connectionGroup);

    const meta: ConnectionMeta = {
      id: connectionId,
      sourceId,
      targetId,
      type,
      connectionType: 'edge',
      waypoints,
    };
    this.connectionMeta.set(connectionId, meta);

    return connectionGroup;
  }

  removeConnection(connectionId: string): void {
    const group = this.connections.get(connectionId);
    if (group) {
      this.canvas.removeObject(group);
    }
    this.connections.delete(connectionId);
    this.connectionMeta.delete(connectionId);
  }

  // =========================================================================
  // 样式
  // =========================================================================

  applyRelationshipStyle(connectionId: string, type: RelationshipType): void {
    const group = this.connections.get(connectionId);
    if (!group) return;

    const style = getDefaultStyle(type);
    const meta = this.connectionMeta.get(connectionId);
    if (meta) {
      meta.type = type;
    }

    const data = getObjectData(group);
    if (data) {
      data.type = type;
    }

    const waypoints = meta?.waypoints ?? [];

    // Update polyline style
    const children = group.getObjects();
    for (const child of children) {
      if (child instanceof Polyline) {
        child.set({
          stroke: style.strokeColor,
          strokeWidth: style.strokeWidth,
          strokeDashArray: style.dashPattern.length > 0 ? style.dashPattern : undefined,
        });
        child.setCoords();
      }
    }

    // Remove old arrowheads and rebuild for new style
    const oldTriangles = group.getObjects().filter((c) => c instanceof Triangle);
    for (const tri of oldTriangles) {
      group.remove(tri);
    }

    if (style.startArrow !== 'none' && waypoints.length >= 2) {
      const startArrow = this.makeArrowhead(waypoints[0], waypoints[1], style);
      if (startArrow) group.add(startArrow);
    }
    if (style.endArrow !== 'none' && waypoints.length >= 2) {
      const endArrow = this.makeArrowhead(
        waypoints[waypoints.length - 1],
        waypoints[waypoints.length - 2],
        style,
      );
      if (endArrow) group.add(endArrow);
    }

    group.setCoords();
  }

  // =========================================================================
  // 路径计算
  // =========================================================================

  calculatePath(
    sourcePoint: Point,
    targetPoint: Point,
    obstacles: Rect[],
  ): Point[] {
    return tryDetour(sourcePoint, targetPoint, obstacles);
  }

  // =========================================================================
  // 路径更新
  // =========================================================================

  updatePathsForElement(elementId: string): void {
    const connected = this.getConnectionsForElement(elementId);

    for (const connObj of connected) {
      const data = getObjectData(connObj);
      if (!data) continue;

      const connId = data.id as string;
      const meta = this.connectionMeta.get(connId);
      if (!meta) continue;

      const sourceObj = this.canvas.getObjectById(meta.sourceId);
      const targetObj = this.canvas.getObjectById(meta.targetId);

      if (!sourceObj || !targetObj) continue;

      // 重新计算端点
      const sourceAnchors = getAnchorPoints(sourceObj);
      const targetAnchors = getAnchorPoints(targetObj);
      const sourceCenter = sourceAnchors[4];
      const targetCenter = targetAnchors[4];

      const sourcePoint = findClosestAnchor(
        sourceAnchors.slice(0, 4),
        targetCenter,
      );
      const targetPoint = findClosestAnchor(
        targetAnchors.slice(0, 4),
        sourceCenter,
      );

      const edgeStyle = getDefaultStyle(meta.type);

      const obstacles = this.collectObstacles(meta.sourceId, meta.targetId);

      let waypoints: Point[];
      switch (edgeStyle.lineType) {
        case 'curved':
          waypoints = generateCurvedPath(sourcePoint, targetPoint);
          break;
        case 'straight':
          waypoints = [sourcePoint, targetPoint];
          break;
        case 'orthogonal':
        default:
          waypoints = this.calculatePath(sourcePoint, targetPoint, obstacles);
          break;
      }

      meta.waypoints = waypoints;

      // Sync to FabricObject data
      if (data) {
        data.waypoints = waypoints;
      }

      this.updatePolylinePoints(connObj as Group, waypoints);
    }
  }

  // =========================================================================
  // 查询
  // =========================================================================

  getConnectionsForElement(elementId: string): FabricObject[] {
    const result: FabricObject[] = [];
    for (const [connId, group] of this.connections) {
      const meta = this.connectionMeta.get(connId);
      if (meta && (meta.sourceId === elementId || meta.targetId === elementId)) {
        result.push(group);
      }
    }
    return result;
  }

  getConnectionById(id: string): FabricObject | null {
    return this.connections.get(id) ?? null;
  }

  // =========================================================================
  // 公开的路径点交互方法（供 InteractionHandler 调用）
  // =========================================================================

  /**
   * 在连线的指定线段上添加路径点。
   * 拖拽连线中间段时调用。
   */
  addWaypoint(
    connectionId: string,
    insertPoint: Point,
    segmentIndex: number,
  ): void {
    const meta = this.connectionMeta.get(connectionId);
    const group = this.connections.get(connectionId);
    if (!meta || !group) return;

    const waypoints = [...meta.waypoints];
    if (segmentIndex < 0 || segmentIndex >= waypoints.length - 1) return;

    waypoints.splice(segmentIndex + 1, 0, insertPoint);
    meta.waypoints = waypoints;

    // Sync to FabricObject data
    const d = getObjectData(group);
    if (d) {
      d.waypoints = waypoints;
    }

    this.updatePolylinePoints(group, waypoints);
  }

  /**
   * 移动已有的路径点。
   * 用户拖拽 waypoint 时调用。
   */
  moveWaypoint(
    connectionId: string,
    waypointIndex: number,
    newPosition: Point,
  ): void {
    const meta = this.connectionMeta.get(connectionId);
    const group = this.connections.get(connectionId);
    if (!meta || !group) return;

    if (waypointIndex < 0 || waypointIndex >= meta.waypoints.length) return;

    meta.waypoints[waypointIndex] = { ...newPosition };

    // Sync to FabricObject data
    const d = getObjectData(group);
    if (d) {
      d.waypoints = [...meta.waypoints];
    }

    this.updatePolylinePoints(group, meta.waypoints);
  }

  /**
   * 删除一个路径点（至少保留两个端点）。
   * 双击 waypoint 时调用。
   */
  removeWaypoint(connectionId: string, waypointIndex: number): void {
    const meta = this.connectionMeta.get(connectionId);
    const group = this.connections.get(connectionId);
    if (!meta || !group) return;

    // 至少保留 2 个端点
    if (meta.waypoints.length <= 2) return;
    if (waypointIndex === 0 || waypointIndex === meta.waypoints.length - 1) return;

    meta.waypoints.splice(waypointIndex, 1);

    // Sync to FabricObject data
    const d = getObjectData(group);
    if (d) {
      d.waypoints = [...meta.waypoints];
    }

    this.updatePolylinePoints(group, meta.waypoints);
  }

  // =========================================================================
  // 连线标签
  // =========================================================================

  /**
   * 给连线添加文字标签。
   */
  setConnectionLabel(connectionId: string, labelText: string): void {
    const group = this.connections.get(connectionId);
    const meta = this.connectionMeta.get(connectionId);
    if (!group || !meta) return;

    // 移除旧标签
    const children = group.getObjects();
    const oldLabel = children.find((c) => {
      const d = getObjectData(c);
      return d?.role === 'connection-label';
    });
    if (oldLabel) {
      group.remove(oldLabel);
    }

    if (!labelText) return;

    // 计算中点位置
    const midIndex = Math.floor(meta.waypoints.length / 2);
    const midPoint = meta.waypoints.length % 2 === 0
      ? {
          x: (meta.waypoints[midIndex - 1].x + meta.waypoints[midIndex].x) / 2,
          y: (meta.waypoints[midIndex - 1].y + meta.waypoints[midIndex].y) / 2,
        }
      : meta.waypoints[midIndex];

    const label = new Text(labelText, {
      left: midPoint.x,
      top: midPoint.y - 12,
      fontSize: 12,
      fill: '#333333',
      fontFamily: 'sans-serif',
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'bottom',
    });

    setChildData(label, { role: 'connection-label' });

    group.add(label);
    group.setCoords();
  }

  /**
   * 获得连线中点。
   */
  getConnectionMidpoint(connectionId: string): Point | null {
    const meta = this.connectionMeta.get(connectionId);
    if (!meta || meta.waypoints.length < 2) return null;

    const midIndex = Math.floor(meta.waypoints.length / 2);
    if (meta.waypoints.length % 2 === 0) {
      const p1 = meta.waypoints[midIndex - 1];
      const p2 = meta.waypoints[midIndex];
      return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }
    return { ...meta.waypoints[midIndex] };
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** 构建连线的 Fabric Group */
  private buildConnectionGroup(
    connectionId: string,
    waypoints: Point[],
    style: EdgeStyle,
    type: RelationshipType,
    sourceId: string,
    targetId: string,
  ): Group {
    const children: FabricObject[] = [];

    const xyPoints: XY[] = waypoints.map((p) => ({ x: p.x, y: p.y }));

    // Polyline 主线
    const polyline = new Polyline(xyPoints, {
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
      strokeDashArray: style.dashPattern.length > 0 ? style.dashPattern : undefined,
      fill: '',
      selectable: false,
      evented: false,
      objectCaching: false,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    });
    children.push(polyline);

    // 起点箭头
    if (style.startArrow !== 'none' && waypoints.length >= 2) {
      const startArrow = this.makeArrowhead(
        waypoints[0],
        waypoints[1],
        style,
      );
      if (startArrow) children.push(startArrow);
    }

    // 终点箭头
    if (style.endArrow !== 'none' && waypoints.length >= 2) {
      const endArrow = this.makeArrowhead(
        waypoints[waypoints.length - 1],
        waypoints[waypoints.length - 2],
        style,
      );
      if (endArrow) children.push(endArrow);
    }

    // Group
    const group = new Group(children, {
      left: 0,
      top: 0,
      selectable: true,
      evented: true,
      subTargetCheck: false,
      excludeFromExport: false,
    });

    const data: ConnectionMeta = {
      id: connectionId,
      sourceId,
      targetId,
      type,
      connectionType: 'edge',
      waypoints,
    };
    (group as ObjectWithData).data = data as unknown as Record<string, unknown>;

    return group;
  }

  /** 创建箭头 Triangle */
  private makeArrowhead(
    tip: Point,
    from: Point,
    style: EdgeStyle,
  ): Triangle | null {
    const arrowSize = Math.max(style.strokeWidth * 4, 6);
    const angle = segmentAngle(from, tip);

    const triangle = new Triangle({
      width: arrowSize,
      height: arrowSize * 1.2,
      fill: style.strokeColor,
      left: tip.x,
      top: tip.y,
      angle: angle + 90,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });

    return triangle;
  }

  /** 收集障碍物 */
  private collectObstacles(
    sourceId: string,
    targetId: string,
  ): Rect[] {
    // 优先使用外部提供者
    if (this.obstacleProvider) {
      const allRects = this.obstacleProvider();
      // 从外部提供者返回的结果中排除源和目标
      // （提供者应返回全部元素，这里做二次过滤）
      return allRects;
    }

    // 回退：从已知连接中收集
    const allObjects = this.getAllKnownCanvasObjects();
    const obstacles: Rect[] = [];

    for (const obj of allObjects) {
      const d = getObjectData(obj);
      const objId = d?.id as string | undefined;

      if (objId === sourceId || objId === targetId) continue;
      if (d?.connectionType === 'edge') continue;

      const rect = obj.getBoundingRect();
      if (rect.width > 0 && rect.height > 0) {
        obstacles.push({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    return obstacles;
  }

  /** 获取已知画布对象 */
  private getAllKnownCanvasObjects(): FabricObject[] {
    const seen = new Set<string>();
    const result: FabricObject[] = [];

    for (const [connId, group] of this.connections) {
      const meta = this.connectionMeta.get(connId);
      if (meta) {
        if (!seen.has(meta.sourceId)) {
          const obj = this.canvas.getObjectById(meta.sourceId);
          if (obj) { result.push(obj); seen.add(meta.sourceId); }
        }
        if (!seen.has(meta.targetId)) {
          const obj = this.canvas.getObjectById(meta.targetId);
          if (obj) { result.push(obj); seen.add(meta.targetId); }
        }
      }
      if (!seen.has(connId)) {
        result.push(group);
        seen.add(connId);
      }
    }

    return result;
  }

  /** 更新 Group 中 Polyline 的点序列和箭头 */
  private updatePolylinePoints(group: Group, waypoints: Point[]): void {
    const children = group.getObjects();

    let polyline: Polyline | undefined;
    const arrowChildren: FabricObject[] = [];

    for (const child of children) {
      if (child instanceof Polyline) {
        polyline = child;
      } else if (child instanceof Triangle) {
        arrowChildren.push(child);
      }
    }

    if (!polyline) return;

    const xyPoints: XY[] = waypoints.map((p) => ({ x: p.x, y: p.y }));
    polyline.set({ points: xyPoints });
    polyline.setCoords();

    // 移除旧箭头
    for (const arrow of arrowChildren) {
      group.remove(arrow);
    }

    // 重建箭头
    const d = getObjectData(group);
    const relType = (d?.type ?? 'Connection') as RelationshipType;
    const style = getDefaultStyle(relType);

    if (style.startArrow !== 'none' && waypoints.length >= 2) {
      const startArrow = this.makeArrowhead(
        waypoints[0],
        waypoints[1],
        style,
      );
      if (startArrow) group.add(startArrow);
    }

    if (style.endArrow !== 'none' && waypoints.length >= 2) {
      const endArrow = this.makeArrowhead(
        waypoints[waypoints.length - 1],
        waypoints[waypoints.length - 2],
        style,
      );
      if (endArrow) group.add(endArrow);
    }

    group.setCoords();
    group.dirty = true;
  }
}

// ===========================================================================
// 辅助: 设置 FabricObject 子对象 data
// ===========================================================================

function setChildData(
  obj: FabricObject,
  data: Record<string, unknown>,
): void {
  const existing = getObjectData(obj) ?? {};
  (obj as ObjectWithData).data = { ...existing, ...data };
}
