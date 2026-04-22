const COLOR = 0x00bcd4;
const COLOR_ACTIVE = 0xffc107;
const BORDER_WIDTH = 4;
const HANDLE_RADIUS = 22;
const LABEL = 'VTT Viewbox';
const MIN_SIZE = 200;
const DEFAULT_ASPECT = 16 / 9;

/**
 * CanvasLayer with a single GM-owned viewbox.
 * Coordinates are scene-space. Aspect ratio is locked on resize.
 */
export class ViewboxOverlay extends foundry.canvas.layers.CanvasLayer {
  constructor({ x, y, width, height, aspect = DEFAULT_ASPECT, onChange }) {
    super();
    this.state = { x, y, width, height };
    this.aspect = aspect;
    this.onChange = onChange ?? (() => {});
    this.dragging = null;

    // Bind handlers so we can attach/detach cleanly
    this._boundDragMove = this._onDragMove.bind(this);
    this._boundDragEnd = this._onDragEnd.bind(this);

    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    this.addChild(this.container);

    // The interactive rectangle — left-drag to move
    this.box = new PIXI.Graphics();
    this.box.eventMode = 'static';
    this.box.cursor = 'move';
    this.box.on('pointerdown', (ev) => this._beginDrag(ev, 'move'));
    this.container.addChild(this.box);

    // Label (non-interactive)
    this.label = new PIXI.Text(LABEL, {
      fontFamily: 'Signika, sans-serif',
      fontSize: 22,
      fontWeight: 'bold',
      fill: COLOR,
      align: 'center'
    });
    this.label.anchor.set(0.5);
    this.label.eventMode = 'none';
    this.container.addChild(this.label);

    // Resize handle (bottom-right only; box itself handles move)
    this.resizeHandle = new PIXI.Graphics();
    this.resizeHandle.eventMode = 'static';
    this.resizeHandle.cursor = 'nwse-resize';
    this.resizeHandle.hitArea = new PIXI.Circle(0, 0, HANDLE_RADIUS);
    this.resizeHandle.on('pointerdown', (ev) => this._beginDrag(ev, 'resize'));
    this.container.addChild(this.resizeHandle);

    this._redraw();
  }

  _redraw(active = false) {
    const { x, y, width, height } = this.state;
    const color = active ? COLOR_ACTIVE : COLOR;
    const left = x - width / 2;
    const top = y - height / 2;

    this.container.position.set(left, top);

    // Box — semi-transparent fill for a real hit area
    this.box.clear();
    this.box.lineStyle(BORDER_WIDTH, color, 0.95);
    this.box.beginFill(color, 0.05);
    this.box.drawRect(0, 0, width, height);
    this.box.endFill();
    this.box.hitArea = new PIXI.Rectangle(0, 0, width, height);

    this.label.position.set(width / 2, -20);
    this.label.style.fill = color;

    // Resize handle: filled circle + diagonal arrow glyph
    const rh = this.resizeHandle;
    rh.clear();
    rh.lineStyle(2, 0xffffff, 1);
    rh.beginFill(color, 1);
    rh.drawCircle(0, 0, HANDLE_RADIUS);
    rh.endFill();
    // Diagonal arrow ↘
    rh.lineStyle(3, 0xffffff, 1);
    rh.moveTo(-8, -8);
    rh.lineTo(8, 8);
    rh.moveTo(2, 8);
    rh.lineTo(8, 8);
    rh.lineTo(8, 2);
    rh.moveTo(-2, -8);
    rh.lineTo(-8, -8);
    rh.lineTo(-8, -2);
    rh.position.set(width, height);
  }

  _sceneLocal(ev) {
    // Convert PIXI event global coords → scene coords (accounts for canvas pan/zoom)
    const g = ev.global ?? ev.data?.global;
    return canvas.stage.toLocal(g);
  }

  _beginDrag(ev, kind) {
    ev.stopPropagation();
    const pos = this._sceneLocal(ev);
    this.dragging = { kind, origin: pos, start: { ...this.state } };
    this._redraw(true);
    // Global listener on the stage catches moves even outside the box
    canvas.stage.on('globalpointermove', this._boundDragMove);
    canvas.stage.on('pointerup', this._boundDragEnd);
    canvas.stage.on('pointerupoutside', this._boundDragEnd);
  }

  _onDragMove(ev) {
    if (!this.dragging) return;
    const pos = this._sceneLocal(ev);
    const dx = pos.x - this.dragging.origin.x;
    const dy = pos.y - this.dragging.origin.y;
    const { kind, start } = this.dragging;

    if (kind === 'move') {
      this.state.x = start.x + dx;
      this.state.y = start.y + dy;
    } else if (kind === 'resize') {
      // Aspect-locked resize: width driven by whichever mouse axis moved more.
      const deltaW = dx;
      const deltaH = dy * this.aspect;
      const delta = Math.max(deltaW, deltaH);
      const newW = Math.max(MIN_SIZE, start.width + delta);
      const newH = newW / this.aspect;
      // Top-left anchor stays fixed; center shifts by half the growth
      this.state.width = newW;
      this.state.height = newH;
      this.state.x = start.x + (newW - start.width) / 2;
      this.state.y = start.y + (newH - start.height) / 2;
    }

    this._redraw(true);
  }

  _onDragEnd() {
    if (!this.dragging) return;
    this.dragging = null;
    canvas.stage.off('globalpointermove', this._boundDragMove);
    canvas.stage.off('pointerup', this._boundDragEnd);
    canvas.stage.off('pointerupoutside', this._boundDragEnd);
    this._redraw(false);
    this.onChange({ ...this.state });
  }

  setAspect(aspect) {
    if (!aspect || !isFinite(aspect) || aspect <= 0) return;
    this.aspect = aspect;
    // Adjust current height to match new aspect, keep width
    this.state.height = this.state.width / aspect;
    this._redraw(this.dragging != null);
    this.onChange({ ...this.state });
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this._redraw(this.dragging != null);
  }

  getState() {
    return { ...this.state };
  }

  destroy(options) {
    canvas.stage.off('globalpointermove', this._boundDragMove);
    canvas.stage.off('pointerup', this._boundDragEnd);
    canvas.stage.off('pointerupoutside', this._boundDragEnd);
    super.destroy({ children: true, ...(options ?? {}) });
  }
}
