// ===========================================================================
// Vitest Setup — 为 jsdom 提供 Canvas Context Mock
// Fabric.js v6 需要 HTMLCanvasElement.getContext('2d') 正常工作
// ===========================================================================

// 模拟 CanvasRenderingContext2D 的核心方法
function createMockContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedStates: Record<string, unknown>[] = [];
  const transform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

  const state = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    lineDashOffset: 0,
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    transform,
    savedStates,
  };

  const noop = (): void => {};

  // 构建 getter/setter 代理
  const ctx = {
    // ---- 状态属性 ----
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    get lineCap() { return state.lineCap; },
    set lineCap(v: CanvasLineCap) { state.lineCap = v; },
    get lineJoin() { return state.lineJoin; },
    set lineJoin(v: CanvasLineJoin) { state.lineJoin = v; },
    get lineDashOffset() { return state.lineDashOffset; },
    set lineDashOffset(v: number) { state.lineDashOffset = v; },
    get miterLimit() { return state.miterLimit; },
    set miterLimit(v: number) { state.miterLimit = v; },
    get font() { return state.font; },
    set font(v: string) { state.font = v; },
    get textAlign() { return state.textAlign; },
    set textAlign(v: CanvasTextAlign) { state.textAlign = v; },
    get textBaseline() { return state.textBaseline; },
    set textBaseline(v: CanvasTextBaseline) { state.textBaseline = v; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v: number) { state.globalAlpha = v; },
    get globalCompositeOperation() { return state.globalCompositeOperation; },
    set globalCompositeOperation(v: GlobalCompositeOperation) { state.globalCompositeOperation = v; },
    get shadowBlur() { return state.shadowBlur; },
    set shadowBlur(v: number) { state.shadowBlur = v; },
    get shadowColor() { return state.shadowColor; },
    set shadowColor(v: string) { state.shadowColor = v; },
    get shadowOffsetX() { return state.shadowOffsetX; },
    set shadowOffsetX(v: number) { state.shadowOffsetX = v; },
    get shadowOffsetY() { return state.shadowOffsetY; },
    set shadowOffsetY(v: number) { state.shadowOffsetY = v; },
    get imageSmoothingEnabled() { return state.imageSmoothingEnabled; },
    set imageSmoothingEnabled(v: boolean) { state.imageSmoothingEnabled = v; },

    // 只读属性
    get canvas() { return canvas; },

    // ---- 变换 ----
    save: () => {
      state.savedStates.push({
        ...state,
        savedStates: [],
        transform: [...state.transform] as typeof state.transform,
      });
    },
    restore: () => {
      const prev = state.savedStates.pop();
      if (prev) {
        Object.assign(state, { ...prev, savedStates: state.savedStates });
      }
    },
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: (...args: number[]) => {
      if (args.length === 6) {
        state.transform = args as typeof state.transform;
      } else {
        state.transform = [args[0], 0, 0, args[3] || args[0], args[4] || 0, args[5] || 0];
      }
    },
    getTransform: () => {
      return {
        a: state.transform[0],
        b: state.transform[1],
        c: state.transform[2],
        d: state.transform[3],
        e: state.transform[4],
        f: state.transform[5],
      } as unknown as DOMMatrix;
    },
    resetTransform: () => {
      state.transform = [1, 0, 0, 1, 0, 0];
    },

    // ---- 路径 ----
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    isPointInPath: () => false,
    isPointInStroke: () => false,

    // ---- 绘制 ----
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 7,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
    }),
    drawImage: noop,
    drawFocusIfNeeded: noop,
    scrollPathIntoView: noop,

    // ---- 像素 ----
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: 'srgb' as PredefinedColorSpace,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: 'srgb' as PredefinedColorSpace,
    }),
    putImageData: noop,

    // ---- 渐变/图案 ----
    createLinearGradient: () => ({
      addColorStop: noop,
    }),
    createRadialGradient: () => ({
      addColorStop: noop,
    }),
    createConicGradient: () => ({
      addColorStop: noop,
    }),
    createPattern: () => null,

    // ---- 虚线 ----
    setLineDash: noop,
    getLineDash: () => [],

    // ---- 滤镜 ----
    get filter() { return 'none'; },
    set filter(_v: string) {},

    // ---- 其他 ----
    createImageBitmap: async () => new ImageBitmap(),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    transferFromImageBitmap: (_bitmap: ImageBitmap | null) => {},

    // 确保 toString 返回正确值，Fabric.js 可能用到
    [Symbol.toStringTag]: 'CanvasRenderingContext2D',
  };

  return ctx as unknown as CanvasRenderingContext2D;
}

// ---- Polyfill HTMLCanvasElement ----

const originalGetContext = HTMLCanvasElement.prototype.getContext;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(HTMLCanvasElement.prototype as any).getContext = function (
  contextId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ..._args: unknown[]
): unknown {
  if (contextId === '2d') {
    return createMockContext(this as HTMLCanvasElement);
  }
  // 其他 context 类型 (webgl, webgl2, bitmaprenderer) 使用原始实现
  if (typeof originalGetContext === 'function') {
    return originalGetContext.call(this, contextId);
  }
  return null;
};

// ---- Polyfill HTMLCanvasElement.toDataURL ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toDataURL = function (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _quality?: unknown,
): string {
  return 'data:image/png;base64,';
};

// ---- Polyfill HTMLCanvasElement.toBlob ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob = function (
  callback: BlobCallback,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _quality?: unknown,
): void {
  callback(new Blob([], { type: 'image/png' }));
};

// ---- Polyfill DragEvent & DataTransfer (jsdom lacks these) ----

class DataTransferMock {
  private _data: Record<string, string> = {};
  private _effectAllowed: string = 'none';
  private _dropEffect: string = 'none';
  items = { add: () => {} };
  files = [] as unknown as FileList;
  types: string[] = [];

  setData(format: string, data: string): void {
    this._data[format] = data;
    if (!this.types.includes(format)) this.types.push(format);
  }
  getData(format: string): string {
    return this._data[format] || '';
  }
  clearData(format?: string): void {
    if (format) { delete this._data[format]; }
    else { this._data = {}; this.types = []; }
  }
  setDragImage(): void {}
  get effectAllowed(): string { return this._effectAllowed; }
  set effectAllowed(v: string) { this._effectAllowed = v; }
  get dropEffect(): string { return this._dropEffect; }
  set dropEffect(v: string) { this._dropEffect = v; }
}

class DragEventMock extends MouseEvent {
  private _dt: DataTransferMock;
  constructor(type: string, init?: MouseEventInit & { dataTransfer?: DataTransferMock }) {
    super(type, init);
    this._dt = init?.dataTransfer || new DataTransferMock();
  }
  get dataTransfer(): DataTransferMock { return this._dt; }
  set dataTransfer(v: DataTransferMock) { this._dt = v; }
}

(globalThis as Record<string, unknown>).DragEvent = DragEventMock;
(globalThis as Record<string, unknown>).DataTransfer = DataTransferMock;
