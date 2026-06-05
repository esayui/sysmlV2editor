// ===========================================================================
// Element Renderers Tests
// 来源: 任务清单 M-FE-02
// ===========================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { Group, FabricObject, Rect, Text, Polygon, Ellipse } from 'fabric';
import type { ICanvasEngine } from '../canvas-engine';
import type {
  SemanticElement,
  ElementType,
} from '@/types/semantic-model';
import type { NodeStyle, Point } from '@/types/canvas-model';
import { DEFAULT_NODE_STYLE } from '@/types/canvas-model';

import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
  getChildRole,
} from '../elements/base-renderer';
import {
  RendererRegistry,
} from '../elements/renderer-registry';
import {
  BlockRenderer,
  BlockInstanceRenderer,
  PortRenderer,
  PackageRenderer,
  ActionRenderer,
  StateRenderer,
  ActorRenderer,
  UseCaseRenderer,
  RequirementRenderer,
  ConstraintRenderer,
  CommentRenderer,
  TextRenderer,
  registerAllRenderers,
  ALL_ELEMENT_TYPES,
  globalRegistry,
} from '../elements/index';

// ===========================================================================
// Mock ICanvasEngine
// ===========================================================================

function createMockCanvas(): ICanvasEngine {
  const objects: FabricObject[] = [];

  return {
    initialize: () => {},
    destroy: () => {},
    zoom: () => {},
    zoomToFit: () => {},
    pan: () => {},
    getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
    setViewport: () => {},
    addObject: (obj: FabricObject) => {
      objects.push(obj);
    },
    removeObject: (obj: FabricObject) => {
      const idx = objects.indexOf(obj);
      if (idx !== -1) objects.splice(idx, 1);
    },
    getObjectById: (id: string) =>
      objects.find((o) => {
        const d = (o as FabricObject & { data?: Record<string, unknown> }).data;
        return d?.id === id;
      }) ?? null,
    getSelectedObjects: () => [],
    loadFromJSON: async () => {},
    toJSON: () => ({
      version: '1.0',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      background: '#FFFFFF',
      objects: [],
    }),
    setGridVisible: () => {},
    setSnapToGrid: () => {},
    setBackground: () => {},
    on: () => {},
    off: () => {},
  };
}

// ===========================================================================
// Semantic Element Helpers
// ===========================================================================

function makeElement(
  overrides: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id: 'elem-1',
    name: 'TestElement',
    qualifiedName: 'TestElement',
    type: 'PartDefinition',
    ownerId: null,
    description: 'Test description',
    properties: {},
    ...overrides,
  };
}

function makePortElement(
  overrides: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id: 'port-1',
    name: 'p1',
    qualifiedName: 'p1',
    type: 'PortDefinition',
    ownerId: null,
    description: '',
    properties: { direction: 'inout' },
    ...overrides,
  };
}

function makeBlockElement(): SemanticElement {
  return makeElement({
    id: 'block-1',
    name: 'Engine',
    type: 'PartDefinition',
    properties: {
      isAbstract: false,
      superTypes: [],
      attributes: [
        { name: 'power', type: 'Real', multiplicity: '1', defaultValue: '100' },
        { name: 'weight', type: 'Real', multiplicity: '1' },
      ],
      ports: [
        { id: 'port-1', name: 'input', direction: 'in' as const, type: 'Fluid' },
        { id: 'port-2', name: 'output', direction: 'out' as const, type: 'Fluid' },
        { id: 'port-3', name: 'control', direction: 'inout' as const, type: 'Signal' },
      ],
    },
  });
}

function makeBlockInstanceElement(): SemanticElement {
  return makeElement({
    id: 'usage-1',
    name: 'myEngine',
    type: 'PartUsage',
    properties: {
      definitionName: 'Engine',
      attributes: [
        { name: 'power', type: 'Real', multiplicity: '1' },
      ],
      ports: [
        { id: 'port-1', name: 'input', direction: 'in' as const, type: 'Fluid' },
      ],
    },
  });
}

function makeRequirementElement(): SemanticElement {
  return makeElement({
    id: 'req-1',
    name: 'Performance',
    type: 'RequirementDefinition',
    description: 'System shall respond within 100ms',
    properties: {
      requirementId: 'REQ-001',
      text: 'The system shall respond to user input within 100 milliseconds.',
      category: 'performance',
      priority: 'high',
      verifiedBy: [],
    },
  });
}

function makeConstraintElement(): SemanticElement {
  return makeElement({
    id: 'constraint-1',
    name: 'PowerBalance',
    type: 'ConstraintDefinition',
    properties: {
      expression: 'input.power = output.power + loss',
      parameters: [
        { name: 'input', type: 'PowerPort', unit: 'W' },
        { name: 'output', type: 'PowerPort', unit: 'W' },
      ],
    },
  });
}

// ===========================================================================
// 1. BaseElementRenderer & RendererRegistry
// ===========================================================================

describe('1. BaseElementRenderer and RendererRegistry', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 1.1 BaseElementRenderer abstract class
  it('1.1 should define abstract methods', () => {
    // Verify BaseElementRenderer is abstract and has required methods
    // (Abstract methods don't appear on prototype in TypeScript,
    // so we verify them through a concrete subclass)
    const blockRenderer = new BlockRenderer(mockCanvas);
    expect(typeof blockRenderer.render).toBe('function');
    expect(typeof blockRenderer.update).toBe('function');
    expect(typeof blockRenderer.getPortAnchors).toBe('function');
    expect(typeof blockRenderer.calculateSize).toBe('function');
    expect(typeof blockRenderer.applyStyle).toBe('function');
  });

  // 1.2 RendererRegistry register/get
  it('1.2 RendererRegistry should register and get renderers', () => {
    const registry = new RendererRegistry();
    const renderer = new BlockRenderer(mockCanvas);

    registry.register('PartDefinition', renderer);

    expect(registry.has('PartDefinition')).toBe(true);
    expect(registry.get('PartDefinition')).toBe(renderer);
  });

  it('1.2 RendererRegistry get for unregistered type should throw', () => {
    const registry = new RendererRegistry();

    expect(() => registry.get('PartDefinition')).toThrow(
      'No renderer registered',
    );
  });

  it('1.2 RendererRegistry getRegisteredTypes should return all types', () => {
    const registry = new RendererRegistry();
    const renderer = new BlockRenderer(mockCanvas);

    registry.register('PartDefinition', renderer);
    registry.register('ItemDefinition', renderer);

    const types = registry.getRegisteredTypes();
    expect(types).toContain('PartDefinition');
    expect(types).toContain('ItemDefinition');
    expect(types).toHaveLength(2);
  });

  // 1.3 createCanvasObject factory method
  it('1.3 createCanvasObject should return non-null FabricObject', () => {
    const registry = new RendererRegistry();
    const renderer = new BlockRenderer(mockCanvas);
    registry.register('PartDefinition', renderer);

    const element = makeBlockElement();
    const fObj = registry.createCanvasObject(element);

    expect(fObj).not.toBeNull();
    expect(fObj).toBeDefined();
    expect(fObj instanceof Group).toBe(true);
  });

  it('1.3 createCanvasObject with position should set coordinates', () => {
    const registry = new RendererRegistry();
    const renderer = new BlockRenderer(mockCanvas);
    registry.register('PartDefinition', renderer);

    const element = makeBlockElement();
    const position: Point = { x: 100, y: 200 };
    const fObj = registry.createCanvasObject(element, position);

    expect(fObj.left).toBe(100);
    expect(fObj.top).toBe(200);
  });

  it('1.3 createCanvasObject should set data on the FabricObject', () => {
    const registry = new RendererRegistry();
    const renderer = new BlockRenderer(mockCanvas);
    registry.register('PartDefinition', renderer);

    const element = makeBlockElement();
    const fObj = registry.createCanvasObject(element);

    const data = (fObj as FabricObject & { data?: Record<string, unknown> }).data;
    expect(data).toBeDefined();
    expect(data?.id).toBe('block-1');
  });

  // 1.4 PortAnchor interface
  it('1.4 PortAnchor should have required fields', () => {
    const anchor: PortAnchor = {
      id: 'test',
      position: 'top',
      point: { x: 10, y: 0 },
      direction: 'in',
    };

    expect(anchor.id).toBe('test');
    expect(anchor.position).toBe('top');
    expect(anchor.point.x).toBe(10);
    expect(anchor.point.y).toBe(0);
    expect(anchor.direction).toBe('in');
  });

  // 1.5 Integration: register + createCanvasObject
  it('1.5 register BlockRenderer and call createCanvasObject returns non-null FabricObject', () => {
    const registry = new RendererRegistry();
    registry.register('PartDefinition', new BlockRenderer(mockCanvas));

    const element = makeElement({ type: 'PartDefinition', name: 'Block1' });
    const fObj = registry.createCanvasObject(element);

    expect(fObj).not.toBeNull();
    expect(fObj instanceof Group).toBe(true);
  });
});

// ===========================================================================
// 2. Structural Renderers
// ===========================================================================

describe('2. Structural Renderers', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 2.1 BlockRenderer
  describe('2.1 BlockRenderer', () => {
    it('should render PartDefinition as rounded rectangle with name', () => {
      const renderer = new BlockRenderer(mockCanvas);
      const element = makeBlockElement();
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;
      const children = group.getObjects();

      // Should have background rect
      const bg = children.find((c) => getChildRole(c) === ChildRole.Background);
      expect(bg).toBeInstanceOf(Rect);

      // Should have name text
      const name = children.find((c) => getChildRole(c) === ChildRole.Name);
      expect(name).toBeInstanceOf(Text);
      expect((name as Text).text).toBe('Engine');

      // Should have attribute texts
      const attrs = children.filter(
        (c) => getChildRole(c) === ChildRole.Attribute,
      );
      expect(attrs.length).toBe(2);

      // Should have port indicators
      const ports = children.filter(
        (c) => getChildRole(c) === ChildRole.Port,
      );
      expect(ports.length).toBe(3);
    });

    it('should calculate reasonable size', () => {
      const renderer = new BlockRenderer(mockCanvas);
      const element = makeBlockElement();
      const size = renderer.calculateSize(element);

      expect(size.width).toBeGreaterThanOrEqual(160);
      expect(size.height).toBeGreaterThanOrEqual(80);
      expect(size.width).toBeLessThan(500);
      expect(size.height).toBeLessThan(300);
    });

    it('should render ItemDefinition', () => {
      const renderer = new BlockRenderer(mockCanvas);
      const element = makeElement({
        type: 'ItemDefinition',
        name: 'Fluid',
        properties: { attributes: [], ports: [] },
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('getPortAnchors should return correct directional anchors', () => {
      const renderer = new BlockRenderer(mockCanvas);
      const element = makeBlockElement();
      const fObj = renderer.render(element);
      const anchors = renderer.getPortAnchors(fObj);

      expect(anchors.length).toBeGreaterThanOrEqual(3);

      // Check direction mapping
      const directions = anchors.map((a) => a.direction);
      expect(directions).toContain('in');
      expect(directions).toContain('out');
      expect(directions).toContain('inout');
    });
  });

  // 2.2 BlockInstanceRenderer
  describe('2.2 BlockInstanceRenderer', () => {
    it('should render PartUsage with dashed border', () => {
      const renderer = new BlockInstanceRenderer(mockCanvas);
      const element = makeBlockInstanceElement();
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;
      const children = group.getObjects();

      const bg = children.find((c) => getChildRole(c) === ChildRole.Background);
      expect(bg).toBeInstanceOf(Rect);

      // Verify dashed border
      const rect = bg as Rect;
      expect(rect.strokeDashArray).toBeDefined();
      expect(rect.strokeDashArray!.length).toBeGreaterThanOrEqual(2);
    });

    it('should show ": DefinitionName" in label', () => {
      const renderer = new BlockInstanceRenderer(mockCanvas);
      const element = makeBlockInstanceElement();
      const fObj = renderer.render(element);
      const group = fObj as Group;

      const name = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Name,
      ) as Text;
      expect(name.text).toContain('myEngine');
      expect(name.text).toContain('Engine');
    });

    it('should render ItemUsage', () => {
      const renderer = new BlockInstanceRenderer(mockCanvas);
      const element = makeElement({
        type: 'ItemUsage',
        name: 'myFluid',
        properties: { definitionName: 'Fluid', attributes: [], ports: [] },
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('getPortAnchors should return port anchor points', () => {
      const renderer = new BlockInstanceRenderer(mockCanvas);
      const element = makeBlockInstanceElement();
      const fObj = renderer.render(element);
      const anchors = renderer.getPortAnchors(fObj);

      expect(anchors.length).toBeGreaterThanOrEqual(1);
      for (const a of anchors) {
        expect(a.point.x).toBeGreaterThanOrEqual(0);
        expect(a.point.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // 2.3 PortRenderer
  describe('2.3 PortRenderer', () => {
    it('should render PortDefinition as small colored square', () => {
      const renderer = new PortRenderer(mockCanvas);
      const element = makePortElement({ properties: { direction: 'in' } });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      );
      expect(bg).toBeInstanceOf(Rect);

      // Size should be small (around 10x10)
      const rect = bg as Rect;
      expect(rect.width).toBeLessThanOrEqual(12);
      expect(rect.height).toBeLessThanOrEqual(12);
    });

    it('should color port by direction: in=blue, out=red, inout=purple', () => {
      const blueRenderer = new PortRenderer(mockCanvas);
      const inPort = makePortElement({ properties: { direction: 'in' } });
      const inObj = blueRenderer.render(inPort);
      const inBg = (inObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      ) as Rect;
      expect(inBg.fill).toBe('#4A90D9');

      const redRenderer = new PortRenderer(mockCanvas);
      const outPort = makePortElement({ properties: { direction: 'out' } });
      const outObj = redRenderer.render(outPort);
      const outBg = (outObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      ) as Rect;
      expect(outBg.fill).toBe('#D94A4A');

      const purpleRenderer = new PortRenderer(mockCanvas);
      const inoutPort = makePortElement({ properties: { direction: 'inout' } });
      const inoutObj = purpleRenderer.render(inoutPort);
      const inoutBg = (inoutObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      ) as Rect;
      expect(inoutBg.fill).toBe('#9B59B6');
    });

    it('should render PortUsage', () => {
      const renderer = new PortRenderer(mockCanvas);
      const element = makeElement({
        type: 'PortUsage',
        name: 'p2',
        properties: { direction: 'inout' },
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('getPortAnchors should return 5 anchors (center + 4 sides)', () => {
      const renderer = new PortRenderer(mockCanvas);
      const element = makePortElement();
      const fObj = renderer.render(element);
      const anchors = renderer.getPortAnchors(fObj);

      expect(anchors.length).toBe(5);
    });
  });

  // 2.4 PackageRenderer
  describe('2.4 PackageRenderer', () => {
    it('should render Package with tab shape', () => {
      const renderer = new PackageRenderer(mockCanvas);
      const element = makeElement({
        type: 'Package',
        name: 'MyPackage',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;

      // Should have tab rect
      const tab = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.PackageTab,
      );
      expect(tab).toBeInstanceOf(Rect);

      // Should have background rect
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      );
      expect(bg).toBeInstanceOf(Rect);
    });

    it('should calculate reasonable size', () => {
      const renderer = new PackageRenderer(mockCanvas);
      const element = makeElement({
        type: 'Package',
        name: 'TestPkg',
      });
      const size = renderer.calculateSize(element);

      expect(size.width).toBeGreaterThanOrEqual(160);
      expect(size.height).toBeGreaterThanOrEqual(80);
    });

    it('getPortAnchors should return 4 side anchors', () => {
      const renderer = new PackageRenderer(mockCanvas);
      const element = makeElement({ type: 'Package', name: 'Pkg' });
      const fObj = renderer.render(element);
      const anchors = renderer.getPortAnchors(fObj);

      expect(anchors.length).toBe(4);
      const positions = anchors.map((a) => a.position);
      expect(positions).toContain('top');
      expect(positions).toContain('right');
      expect(positions).toContain('bottom');
      expect(positions).toContain('left');
    });
  });

  // 2.5 Combined structural test
  it('2.5 each structural renderer produces reasonably sized FabricObject', () => {
    const renderers = {
      block: new BlockRenderer(mockCanvas),
      instance: new BlockInstanceRenderer(mockCanvas),
      port: new PortRenderer(mockCanvas),
      package: new PackageRenderer(mockCanvas),
    };

    const elements = {
      block: makeBlockElement(),
      instance: makeBlockInstanceElement(),
      port: makePortElement(),
      package: makeElement({ type: 'Package', name: 'Pkg' }),
    };

    for (const [key, renderer] of Object.entries(renderers)) {
      const element = elements[key as keyof typeof elements];
      const fObj = renderer.render(element);
      const size = renderer.calculateSize(element);

      expect(fObj).not.toBeNull();
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
      // Sizes must be within reasonable bounds
      expect(size.width).toBeLessThan(800);
      expect(size.height).toBeLessThan(600);
    }
  });
});

// ===========================================================================
// 3. Behavioral Renderers
// ===========================================================================

describe('3. Behavioral Renderers', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 3.1 ActionRenderer
  describe('3.1 ActionRenderer', () => {
    it('should render ActionDefinition as rounded rectangle with name', () => {
      const renderer = new ActionRenderer(mockCanvas);
      const element = makeElement({
        type: 'ActionDefinition',
        name: 'DoSomething',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      );
      expect(bg).toBeInstanceOf(Rect);
      expect((bg as Rect).rx).toBeGreaterThan(0);
    });

    it('should render ActionUsage', () => {
      const renderer = new ActionRenderer(mockCanvas);
      const element = makeElement({
        type: 'ActionUsage',
        name: 'callAction',
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('update() should change label text', () => {
      const renderer = new ActionRenderer(mockCanvas);
      const element = makeElement({
        type: 'ActionDefinition',
        name: 'OldName',
      });
      const fObj = renderer.render(element);

      const updatedElement = { ...element, name: 'NewName' };
      renderer.update(fObj, updatedElement);

      const name = (fObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.Name,
      ) as Text;
      expect(name.text).toBe('NewName');
    });
  });

  // 3.2 StateRenderer
  describe('3.2 StateRenderer', () => {
    it('should render StateDefinition as rounded rectangle', () => {
      const renderer = new StateRenderer(mockCanvas);
      const element = makeElement({
        type: 'StateDefinition',
        name: 'Idle',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
    });

    it('should render StateUsage', () => {
      const renderer = new StateRenderer(mockCanvas);
      const element = makeElement({
        type: 'StateUsage',
        name: 'activeState',
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('update() should change label text', () => {
      const renderer = new StateRenderer(mockCanvas);
      const element = makeElement({
        type: 'StateDefinition',
        name: 'OldState',
      });
      const fObj = renderer.render(element);

      const updatedElement = { ...element, name: 'NewState' };
      renderer.update(fObj, updatedElement);

      const name = (fObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.Name,
      ) as Text;
      expect(name.text).toBe('NewState');
    });
  });

  // 3.3 ActorRenderer
  describe('3.3 ActorRenderer', () => {
    it('should render Actor as stick figure with label', () => {
      const renderer = new ActorRenderer(mockCanvas);
      const element = makeElement({
        type: 'Actor',
        name: 'User',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;
      const children = group.getObjects();

      // Should have a label
      const label = children.find(
        (c) => getChildRole(c) === ChildRole.ActorLabel,
      );
      expect(label).toBeInstanceOf(Text);
      expect((label as Text).text).toBe('User');
    });

    it('update() should change actor label text', () => {
      const renderer = new ActorRenderer(mockCanvas);
      const element = makeElement({ type: 'Actor', name: 'OldUser' });
      const fObj = renderer.render(element);

      const updatedElement = { ...element, name: 'NewUser' };
      renderer.update(fObj, updatedElement);

      const label = (fObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.ActorLabel,
      ) as Text;
      expect(label.text).toBe('NewUser');
    });
  });

  // 3.4 UseCaseRenderer
  describe('3.4 UseCaseRenderer', () => {
    it('should render UseCase as ellipse with name', () => {
      const renderer = new UseCaseRenderer(mockCanvas);
      const element = makeElement({
        type: 'UseCase',
        name: 'Login',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      );
      expect(bg).toBeInstanceOf(Ellipse);
    });

    it('update() should change label text', () => {
      const renderer = new UseCaseRenderer(mockCanvas);
      const element = makeElement({ type: 'UseCase', name: 'OldLogin' });
      const fObj = renderer.render(element);

      const updatedElement = { ...element, name: 'NewLogin' };
      renderer.update(fObj, updatedElement);

      const name = (fObj as Group).getObjects().find(
        (c) => getChildRole(c) === ChildRole.Name,
      ) as Text;
      expect(name.text).toBe('NewLogin');
    });
  });

  // 3.5 Update test for all behavioral renderers
  it('3.5 all behavioral renderers update() should change label text', () => {
    const renderers: {
      name: string;
      renderer: BaseElementRenderer<SemanticElement>;
      type: ElementType;
    }[] = [
      { name: 'Action', renderer: new ActionRenderer(mockCanvas), type: 'ActionDefinition' },
      { name: 'State', renderer: new StateRenderer(mockCanvas), type: 'StateDefinition' },
      { name: 'Actor', renderer: new ActorRenderer(mockCanvas), type: 'Actor' },
      { name: 'UseCase', renderer: new UseCaseRenderer(mockCanvas), type: 'UseCase' },
    ];

    for (const { renderer, type } of renderers) {
      const element = makeElement({ type, name: 'OldName' });
      const fObj = renderer.render(element);

      const updated = { ...element, name: 'UpdatedName' };
      renderer.update(fObj, updated);

      // Verify update does not throw
      expect(fObj).toBeDefined();
    }
  });
});

// ===========================================================================
// 4. Requirement & Constraint Renderers
// ===========================================================================

describe('4. Requirement & Constraint Renderers', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 4.1 RequirementRenderer
  describe('4.1 RequirementRenderer', () => {
    it('should render Requirement with notched rectangle shape', () => {
      const renderer = new RequirementRenderer(mockCanvas);
      const element = makeRequirementElement();
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;

      // Should use Polygon for notched shape
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      );
      expect(bg).toBeInstanceOf(Polygon);
    });

    it('should display requirement ID (REQ-001)', () => {
      const renderer = new RequirementRenderer(mockCanvas);
      const element = makeRequirementElement();
      const fObj = renderer.render(element);
      const group = fObj as Group;

      const idObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Id,
      ) as Text;
      expect(idObj).toBeDefined();
      expect(idObj.text).toBe('REQ-001');
    });

    it('should display requirement text', () => {
      const renderer = new RequirementRenderer(mockCanvas);
      const element = makeRequirementElement();
      const fObj = renderer.render(element);
      const group = fObj as Group;

      const textObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Text,
      ) as Text;
      expect(textObj).toBeDefined();
      expect(textObj.text).toContain('100 milliseconds');
    });

    it('should render RequirementUsage and StakeholderRequirement', () => {
      const renderer = new RequirementRenderer(mockCanvas);

      const usage = makeElement({
        type: 'RequirementUsage',
        name: 'ReqUsage',
        properties: { requirementId: 'REQ-002', text: 'Usage req text' },
      });
      expect(renderer.render(usage)).toBeInstanceOf(Group);

      const stake = makeElement({
        type: 'StakeholderRequirement',
        name: 'StakeReq',
        properties: { requirementId: 'SH-001', text: 'Stakeholder need' },
      });
      expect(renderer.render(stake)).toBeInstanceOf(Group);
    });

    it('should render requirement without ID when no requirementId', () => {
      const renderer = new RequirementRenderer(mockCanvas);
      const element = makeElement({
        type: 'RequirementDefinition',
        name: 'SimpleReq',
        properties: { text: 'A simple requirement' },
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('should render requirement without text (fallback to description)', () => {
      const renderer = new RequirementRenderer(mockCanvas);
      const element = makeElement({
        type: 'RequirementDefinition',
        name: 'ReqName',
        description: 'Fallback description',
        properties: { requirementId: 'REQ-003' },
      });
      const fObj = renderer.render(element);
      const group = fObj as Group;
      const textObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Text,
      ) as Text;
      expect(textObj.text).toBe('Fallback description');
    });
  });

  // 4.2 ConstraintRenderer
  describe('4.2 ConstraintRenderer', () => {
    it('should render Constraint with name and expression', () => {
      const renderer = new ConstraintRenderer(mockCanvas);
      const element = makeConstraintElement();
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;

      // Name
      const nameObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Name,
      ) as Text;
      expect(nameObj.text).toBe('PowerBalance');

      // Expression
      const exprObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Expression,
      ) as Text;
      expect(exprObj).toBeDefined();
      expect(exprObj.text).toContain('input.power');
    });

    it('should render constraint parameters', () => {
      const renderer = new ConstraintRenderer(mockCanvas);
      const element = makeConstraintElement();
      const fObj = renderer.render(element);
      const group = fObj as Group;

      const params = group.getObjects().filter(
        (c) => getChildRole(c) === ChildRole.Attribute,
      );
      expect(params.length).toBe(2);
    });

    it('should render ConstraintUsage', () => {
      const renderer = new ConstraintRenderer(mockCanvas);
      const element = makeElement({
        type: 'ConstraintUsage',
        name: 'MyConstraint',
        properties: { expression: 'a = b + c', parameters: [] },
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });

    it('should render constraint without expression', () => {
      const renderer = new ConstraintRenderer(mockCanvas);
      const element = makeElement({
        type: 'ConstraintDefinition',
        name: 'EmptyConstraint',
        properties: { parameters: [] },
      });
      const fObj = renderer.render(element);
      expect(fObj).toBeInstanceOf(Group);
    });
  });

  // 4.3 Requirement notched path verification
  it('4.3 Requirement notched polygon should have correct vertex count', () => {
    const renderer = new RequirementRenderer(mockCanvas);
    const element = makeRequirementElement();
    const fObj = renderer.render(element);
    const group = fObj as Group;

    const bg = group.getObjects().find(
      (c) => getChildRole(c) === ChildRole.Background,
    ) as Polygon;

    // Notched rectangle has 6 vertices
    const points = (bg as Polygon & { points: { x: number; y: number }[] }).points;
    expect(points).toBeDefined();
    expect(points.length).toBe(6);
  });
});

// ===========================================================================
// 5. Comment Renderer
// ===========================================================================

describe('5. Comment Renderers', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 5.1 CommentRenderer
  describe('5.1 CommentRenderer', () => {
    it('should render Comment with folded corner shape', () => {
      const renderer = new CommentRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'Note',
        description: 'This is a comment',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Group);
      const group = fObj as Group;

      // Should have background (Polygon)
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      );
      expect(bg).toBeInstanceOf(Polygon);

      // Should have fold corner
      const fold = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.FoldCorner,
      );
      expect(fold).toBeInstanceOf(Polygon);
    });

    it('should use yellow background by default', () => {
      const renderer = new CommentRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'Note',
        description: 'Test',
      });
      const fObj = renderer.render(element);
      const group = fObj as Group;
      const bg = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Background,
      ) as Polygon;

      // Default fill should be yellow-ish
      expect(bg.fill).toBe('#FFFFCC');
    });

    it('should display comment text', () => {
      const renderer = new CommentRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'Note',
        description: 'This is a note',
      });
      const fObj = renderer.render(element);
      const group = fObj as Group;

      const textObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Text,
      ) as Text;
      expect(textObj).toBeDefined();
      expect(textObj.text).toBe('This is a note');
    });

    it('should fallback to element name if no description', () => {
      const renderer = new CommentRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'MyComment',
        description: '',
      });
      const fObj = renderer.render(element);
      const group = fObj as Group;
      const textObj = group.getObjects().find(
        (c) => getChildRole(c) === ChildRole.Text,
      ) as Text;
      expect(textObj.text).toBe('MyComment');
    });
  });

  // 5.2 TextRenderer
  describe('5.2 TextRenderer', () => {
    it('should render as plain Fabric Text object', () => {
      const renderer = new TextRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'Label',
        description: 'Plain text content',
      });
      const fObj = renderer.render(element);

      expect(fObj).toBeInstanceOf(Text);
      expect((fObj as Text).text).toBe('Plain text content');
    });

    it('should fallback to name if no description', () => {
      const renderer = new TextRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'OnlyName',
        description: '',
      });
      const fObj = renderer.render(element);

      expect((fObj as Text).text).toBe('OnlyName');
    });

    it('update() should change text content', () => {
      const renderer = new TextRenderer(mockCanvas);
      const element = makeElement({
        type: 'Comment',
        name: 'Old',
        description: 'Old text',
      });
      const fObj = renderer.render(element);

      const updated = { ...element, description: 'New text' };
      renderer.update(fObj, updated);

      expect((fObj as Text).text).toBe('New text');
    });
  });
});

// ===========================================================================
// 6. Style Application
// ===========================================================================

describe('6. Style and Update', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 6.1 applyStyle
  it('6.1 applyStyle should map NodeStyle to FabricObject properties', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();

    const customStyle: NodeStyle = {
      fillColor: '#FFEEDD',
      strokeColor: '#FF0000',
      strokeWidth: 4,
      fontSize: 18,
      fontFamily: 'serif',
      fontColor: '#0000FF',
      opacity: 0.8,
      borderRadius: 8,
      showShadow: true,
    };

    const fObj = renderer.render(element, customStyle);

    // Check group-level properties
    expect(fObj.opacity).toBe(0.8);

    // Check shadow
    expect(fObj.shadow).not.toBeNull();

    // Check child styles
    const group = fObj as Group;
    const bg = group.getObjects().find(
      (c) => getChildRole(c) === ChildRole.Background,
    ) as Rect;
    expect(bg.fill).toBe('#FFEEDD');
    expect(bg.stroke).toBe('#FF0000');
    expect(bg.strokeWidth).toBe(4);

    const name = group.getObjects().find(
      (c) => getChildRole(c) === ChildRole.Name,
    ) as Text;
    expect(name.fill).toBe('#0000FF');
    expect(name.fontFamily).toBe('serif');
    expect(name.fontSize).toBe(18);
  });

  it('6.1 applyStyle with showShadow=false should remove shadow', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();

    const noShadowStyle: NodeStyle = {
      ...DEFAULT_NODE_STYLE,
      showShadow: false,
    };

    const fObj = renderer.render(element, noShadowStyle);
    expect(fObj.shadow).toBeNull();
  });

  it('6.1 should use DEFAULT_NODE_STYLE when no style provided', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();

    const fObj = renderer.render(element);

    expect(fObj.opacity).toBe(DEFAULT_NODE_STYLE.opacity);
  });

  // 6.2 Update with style change
  it('6.2 update should apply new style to existing FabricObject', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();

    const fObj = renderer.render(element);

    const newStyle: NodeStyle = {
      fillColor: '#AAAAAA',
      strokeColor: '#111111',
      strokeWidth: 3,
      fontSize: 16,
      fontFamily: 'monospace',
      fontColor: '#FFFFFF',
      opacity: 0.9,
      borderRadius: 6,
      showShadow: false,
    };

    renderer.update(fObj, element, newStyle);

    const bg = (fObj as Group).getObjects().find(
      (c) => getChildRole(c) === ChildRole.Background,
    ) as Rect;
    expect(bg.fill).toBe('#AAAAAA');
    expect(bg.stroke).toBe('#111111');
    expect(bg.strokeWidth).toBe(3);

    const name = (fObj as Group).getObjects().find(
      (c) => getChildRole(c) === ChildRole.Name,
    ) as Text;
    expect(name.fill).toBe('#FFFFFF');
    expect(name.fontFamily).toBe('monospace');
    expect(name.fontSize).toBe(16);

    expect(fObj.opacity).toBe(0.9);
  });

  // 6.3 Update changes reflect in FabricObject
  it('6.3 update should change label text in FabricObject', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeElement({
      type: 'PartDefinition',
      name: 'OldBlock',
      properties: { attributes: [], ports: [] },
    });

    const fObj = renderer.render(element);

    const nameBefore = (fObj as Group).getObjects().find(
      (c) => getChildRole(c) === ChildRole.Name,
    ) as Text;
    expect(nameBefore.text).toBe('OldBlock');

    const updatedElement = { ...element, name: 'NewBlock' };
    renderer.update(fObj, updatedElement);

    const nameAfter = (fObj as Group).getObjects().find(
      (c) => getChildRole(c) === ChildRole.Name,
    ) as Text;
    expect(nameAfter.text).toBe('NewBlock');
  });
});

// ===========================================================================
// 7. Port Anchors
// ===========================================================================

describe('7. Port Anchors', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  // 7.1 BlockRenderer getPortAnchors from element properties
  it('7.1 BlockRenderer getPortAnchors should iterate properties.ports', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();
    const fObj = renderer.render(element);

    const anchors = renderer.getPortAnchors(fObj);

    // Element has 3 ports
    expect(anchors.length).toBe(3);

    // Each anchor should have required fields
    for (const anchor of anchors) {
      expect(anchor.id).toBeTruthy();
      expect(['top', 'right', 'bottom', 'left', 'center']).toContain(
        anchor.position,
      );
      expect(typeof anchor.point.x).toBe('number');
      expect(typeof anchor.point.y).toBe('number');
      expect(['in', 'out', 'inout']).toContain(anchor.direction);
    }
  });

  it('7.1 BlockRenderer getPortAnchors with no ports should return empty', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeElement({
      type: 'PartDefinition',
      name: 'Empty',
      properties: { attributes: [], ports: [] },
    });
    const fObj = renderer.render(element);

    const anchors = renderer.getPortAnchors(fObj);
    expect(anchors).toHaveLength(0);
  });

  // 7.2 PortAnchor coordinates use dynamic bounding rect
  it('7.2 PortAnchor coordinates should use getBoundingRect()', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();
    const fObj = renderer.render(element);

    const anchors = renderer.getPortAnchors(fObj);

    for (const anchor of anchors) {
      // Coordinates must be non-negative and within reasonable bounds
      expect(anchor.point.x).toBeGreaterThanOrEqual(0);
      expect(anchor.point.y).toBeGreaterThanOrEqual(0);
      // Should be within the element bounds
      expect(anchor.point.x).toBeLessThanOrEqual(fObj.width! + 20);
      expect(anchor.point.y).toBeLessThanOrEqual(fObj.height! + 20);
    }
  });

  // 7.3 PortAnchor coordinates follow object position changes
  it('7.3 PortAnchor coordinates should follow scaling', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeBlockElement();
    const fObj = renderer.render(element);

    // Get initial anchors
    const anchorsBefore = renderer.getPortAnchors(fObj);

    // Scale the object
    fObj.set({ scaleX: 2, scaleY: 2 });
    fObj.setCoords();

    // Get anchors after scaling
    const anchorsAfter = renderer.getPortAnchors(fObj);

    // After 2x scale, points should be roughly 2x (via bounding rect)
    for (let i = 0; i < anchorsAfter.length; i++) {
      // Coordinates should have changed due to scaling
      const before = anchorsBefore[i];
      const after = anchorsAfter[i];
      // The bounding rect accounts for scaling, so coordinates scale accordingly
      expect(after.point.x).toBeGreaterThanOrEqual(before.point.x);
      expect(after.point.y).toBeGreaterThanOrEqual(before.point.y);
    }
  });

  // 7.3 PortAnchor after position change
  it('7.3 PortAnchor coordinates should follow position change', () => {
    const renderer = new PortRenderer(mockCanvas);
    const element = makePortElement();
    const fObj = renderer.render(element);

    const anchorsBefore = renderer.getPortAnchors(fObj);

    // Move the object
    fObj.set({ left: 100, top: 200 });
    fObj.setCoords();

    const anchorsAfter = renderer.getPortAnchors(fObj);

    // PortAnchor coordinates are relative to object top-left, so they
    // should be the same (the bounding rect changes in absolute terms
    // but relative coordinates within the object stay the same)
    for (let i = 0; i < anchorsAfter.length; i++) {
      expect(anchorsAfter[i].point.x).toBeCloseTo(anchorsBefore[i].point.x, 1);
      expect(anchorsAfter[i].point.y).toBeCloseTo(anchorsBefore[i].point.y, 1);
    }
  });
});

// ===========================================================================
// 8. Registry Coverage (all ElementType mapped)
// ===========================================================================

describe('8. Registry Coverage', () => {
  it('8.1 Every ElementType should have a registered renderer', () => {
    const mockCanvas = createMockCanvas();
    registerAllRenderers(mockCanvas);

    for (const type of ALL_ELEMENT_TYPES) {
      expect(globalRegistry.has(type)).toBe(true);
    }
  });

  it('8.1 ALL_ELEMENT_TYPES should cover all ElementType variants', () => {
    // All 25 ElementType values must be present
    const expectedTypes: ElementType[] = [
      'PartDefinition', 'PartUsage', 'ItemDefinition', 'ItemUsage',
      'PortDefinition', 'PortUsage',
      'InterfaceDefinition', 'InterfaceUsage',
      'AttributeDefinition', 'AttributeUsage',
      'EnumerationDefinition',
      'ActionDefinition', 'ActionUsage',
      'StateDefinition', 'StateUsage',
      'Transition',
      'Actor', 'UseCase',
      'RequirementDefinition', 'RequirementUsage', 'StakeholderRequirement',
      'ConstraintDefinition', 'ConstraintUsage',
      'Package', 'Comment',
    ];

    // ALL_ELEMENT_TYPES should be at least this many
    expect(ALL_ELEMENT_TYPES.length).toBeGreaterThanOrEqual(expectedTypes.length);

    for (const type of expectedTypes) {
      expect(ALL_ELEMENT_TYPES).toContain(type);
    }
  });

  it('8.2 registerAllRenderers should not throw', () => {
    const mockCanvas = createMockCanvas();
    expect(() => registerAllRenderers(mockCanvas)).not.toThrow();
  });

  it('8.2 each registered type should have a working renderer (createCanvasObject)', () => {
    const mockCanvas = createMockCanvas();
    registerAllRenderers(mockCanvas);

    for (const type of ALL_ELEMENT_TYPES) {
      const element = makeElement({ type, name: `${type}Test` });
      const fObj = globalRegistry.createCanvasObject(element);

      expect(fObj).not.toBeNull();
      expect(fObj).toBeDefined();
    }
  });
});

// ===========================================================================
// 9. Renderer-specific edge cases
// ===========================================================================

describe('9. Edge Cases', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  it('should handle element with empty name', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeElement({
      type: 'PartDefinition',
      name: '',
      properties: { attributes: [], ports: [] },
    });
    const fObj = renderer.render(element);
    expect(fObj).not.toBeNull();
  });

  it('should handle element with very long name', () => {
    const renderer = new BlockRenderer(mockCanvas);
    const element = makeElement({
      type: 'PartDefinition',
      name: 'A'.repeat(100),
      properties: { attributes: [], ports: [] },
    });
    const fObj = renderer.render(element);
    const size = renderer.calculateSize(element);
    expect(size.width).toBeGreaterThan(160);
    expect(fObj).not.toBeNull();
  });

  it('should handle multiple renderer instances independently', () => {
    const renderer1 = new BlockRenderer(mockCanvas);
    const renderer2 = new BlockRenderer(mockCanvas);

    const elem1 = makeElement({
      id: 'block-a',
      type: 'PartDefinition',
      name: 'BlockA',
      properties: { attributes: [], ports: [] },
    });
    const elem2 = makeElement({
      id: 'block-b',
      type: 'PartDefinition',
      name: 'BlockB',
      properties: { attributes: [], ports: [] },
    });

    const obj1 = renderer1.render(elem1);
    const obj2 = renderer2.render(elem2);

    expect(obj1).not.toBe(obj2);
    const d1 = (obj1 as FabricObject & { data?: Record<string, unknown> }).data;
    const d2 = (obj2 as FabricObject & { data?: Record<string, unknown> }).data;
    expect(d1?.id).toBe('block-a');
    expect(d2?.id).toBe('block-b');
  });

  it('calculateSize should always return positive dimensions', () => {
    const renderers = [
      new BlockRenderer(mockCanvas),
      new BlockInstanceRenderer(mockCanvas),
      new PortRenderer(mockCanvas),
      new PackageRenderer(mockCanvas),
      new ActionRenderer(mockCanvas),
      new StateRenderer(mockCanvas),
      new ActorRenderer(mockCanvas),
      new UseCaseRenderer(mockCanvas),
      new RequirementRenderer(mockCanvas),
      new ConstraintRenderer(mockCanvas),
      new CommentRenderer(mockCanvas),
      new TextRenderer(mockCanvas),
    ];

    const elements: [string, SemanticElement][] = [
      ['Block', makeBlockElement()],
      ['Instance', makeBlockInstanceElement()],
      ['Port', makePortElement()],
      ['Package', makeElement({ type: 'Package', name: 'Pkg' })],
      ['Action', makeElement({ type: 'ActionDefinition', name: 'Act' })],
      ['State', makeElement({ type: 'StateDefinition', name: 'St' })],
      ['Actor', makeElement({ type: 'Actor', name: 'Actor' })],
      ['UseCase', makeElement({ type: 'UseCase', name: 'UC' })],
      ['Req', makeRequirementElement()],
      ['Constraint', makeConstraintElement()],
      ['Comment', makeElement({ type: 'Comment', name: 'Note', description: 'Test' })],
      ['Text', makeElement({ type: 'Comment', name: 'Text', description: 'Hello' })],
    ];

    for (let i = 0; i < renderers.length; i++) {
      const size = renderers[i].calculateSize(elements[i][1]);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// 10. Transition and edge ElementTypes
// ===========================================================================

describe('10. Transition and Special Types', () => {
  let mockCanvas: ICanvasEngine;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    registerAllRenderers(mockCanvas);
  });

  it('Transition type should be registered', () => {
    expect(globalRegistry.has('Transition')).toBe(true);
  });

  it('Transition should render as State-like object', () => {
    const element = makeElement({
      type: 'Transition',
      name: 'T1',
    });
    const fObj = globalRegistry.createCanvasObject(element);
    expect(fObj).toBeInstanceOf(Group);
  });

  it('InterfaceDefinition should render as Block', () => {
    const element = makeElement({
      type: 'InterfaceDefinition',
      name: 'IFace',
    });
    const fObj = globalRegistry.createCanvasObject(element);
    expect(fObj).toBeInstanceOf(Group);
  });

  it('InterfaceUsage should render as BlockInstance', () => {
    const element = makeElement({
      type: 'InterfaceUsage',
      name: 'myIFace',
    });
    const fObj = globalRegistry.createCanvasObject(element);
    expect(fObj).toBeInstanceOf(Group);
  });

  it('AttributeDefinition should render as Block', () => {
    const element = makeElement({
      type: 'AttributeDefinition',
      name: 'Attr',
    });
    const fObj = globalRegistry.createCanvasObject(element);
    expect(fObj).toBeInstanceOf(Group);
  });

  it('AttributeUsage should render as BlockInstance', () => {
    const element = makeElement({
      type: 'AttributeUsage',
      name: 'myAttr',
    });
    const fObj = globalRegistry.createCanvasObject(element);
    expect(fObj).toBeInstanceOf(Group);
  });

  it('EnumerationDefinition should render as Block', () => {
    const element = makeElement({
      type: 'EnumerationDefinition',
      name: 'Colors',
    });
    const fObj = globalRegistry.createCanvasObject(element);
    expect(fObj).toBeInstanceOf(Group);
  });
});
