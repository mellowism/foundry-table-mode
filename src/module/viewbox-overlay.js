import { MODULE_ID } from './socket-protocol.js';

const COLOR = 0x00bcd4;         // cyan
const COLOR_ACTIVE = 0xffc107;  // amber while dragging
const BORDER_WIDTH = 4;
const HANDLE_RADIUS = 18;
const LABEL = 'VTT Viewbox';

/**
 * CanvasLayer that draws a single GM-owned viewbox with move + resize handles.
 * Coordinates are scene-space.
 *
 * Emits `onChange({x, y, width, height})` whenever the GM finishes a drag/resize.
 */
export class ViewboxOverlay extends foundry.canvas.layers.CanvasLayer {
  constructor({ x, y, width, height, onChange }) {
    super();
    this.state = { x, y, width, height };
    this.onChange = onChange ?? (() => {});
    this.dragging = null;

    this.container = new PIXI.Container();
    this.container.eventMode = 'static';
    this.addChild(this.container);

    this.box = new PIXI.Graphics();
    this.box.eventMode = 'static';
    this.container.addChild(this.box);

    this.label = new PIXI.Text(LABEL, {
      fontFamily: 'Signika, sans-serif',
      fontSize: 22,
      fontWeight: 'bold',
      fill: COLOR,
      align: 'center'
    });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);

    this.moveHandle = this._makeHandle('move', 'fa-arrows', 'move');
    this.resizeHandle = this._makeHandle('resize', 'fa-compress-arrows-alt', 'nwse-resize');
    this.container.addChild(this.moveHandle);
    this.container.addChild(this.resizeHandle);

    this._redraw();
  }

  _makeHandle(kind, _iconClass, cursor) {
    const handle = new PIXI.Graphics();
    handle.eventMode = 'static';
    handle.cursor = cursor;
    handle.hitArea = new PIXI.Circle(0, 0, HANDLE_RADIUS);
    handle._kind = kind;
    handle.on('pointerdown', (ev) => this._onHandleDown(ev, kind));
    return handle;
  }

  /** Re-render positions + shapes from current state. */
  _redraw(active = false) {
    const { x, y, width, height } = this.state;
    const color = active ? COLOR_ACTIVE : COLOR;
    const left = x - width / 2;
    const top = y - height / 2;

    // Position container at top-left of the box
    this.container.position.set(left, top);

    // Box outline — coords relative to container
    this.box.clear();
    this.box.lineStyle(BORDER_WIDTH, color, 0.9);
    this.box.beginFill(color, 0.08);
    this.box.drawRect(0, 0, width, height);
    this.box.endFill();
    this.box.hitArea = new PIXI.Rectangle(0, 0, width, height);

    this.label.position.set(width / 2, -20);
    this.label.style.fill = color;

    // Move handle at top-left of box, resize handle at bottom-right
    this.moveHandle.clear();
    this.moveHandle.lineStyle(2, 0xffffff, 1);
    this.moveHandle.beginFill(color, 1);
    this.moveHandle.drawCircle(0, 0, HANDLE_RADIUS);
    this.moveHandle.endFill();
    this.moveHandle.position.set(-HANDLE_RADIUS, -HANDLE_RADIUS);

    this.resizeHandle.clear();
    this.resizeHandle.lineStyle(2, 0xffffff, 1);
    this.resizeHandle.beginFill(color, 1);
    this.resizeHandle.drawCircle(0, 0, HANDLE_RADIUS);
    this.resizeHandle.endFill();
    this.resizeHandle.position.set(width + HANDLE_RADIUS, height + HANDLE_RADIUS);
  }

  _onHandleDown(ev, kind) {
    ev.stopPropagation();
    const origin = ev.data.getLocalPosition(canvas.stage);
    this.dragging = {
      kind,
      origin,
      start: { ...this.state }
    };
    this._redraw(true);
    canvas.stage.on('pointermove', this._onDragMove, this);
    canvas.stage.on('pointerup', this._onDragEnd, this);
    canvas.stage.on('pointerupoutside', this._onDragEnd, this);
  }

  _onDragMove(ev) {
    if (!this.dragging) return;
    const pos = ev.data.getLocalPosition(canvas.stage);
    const dx = pos.x - this.dragging.origin.x;
    const dy = pos.y - this.dragging.origin.y;

    if (this.dragging.kind === 'move') {
      this.state.x = this.dragging.start.x + dx;
      this.state.y = this.dragging.start.y + dy;
    } else if (this.dragging.kind === 'resize') {
      // Uniform resize from top-left anchor: grow box by max(dx, dy)
      const delta = Math.max(dx, dy);
      const minSize = 200;
      const newW = Math.max(minSize, this.dragging.start.width + delta);
      const newH = Math.max(minSize, this.dragging.start.height + delta * (this.dragging.start.height / this.dragging.start.width));
      // Keep top-left anchor fixed: x,y is center, so shift by half-delta
      const cxShift = (newW - this.dragging.start.width) / 2;
      const cyShift = (newH - this.dragging.start.height) / 2;
      this.state.width = newW;
      this.state.height = newH;
      this.state.x = this.dragging.start.x + cxShift;
      this.state.y = this.dragging.start.y + cyShift;
    }

    this._redraw(true);
  }

  _onDragEnd() {
    if (!this.dragging) return;
    this.dragging = null;
    canvas.stage.off('pointermove', this._onDragMove, this);
    canvas.stage.off('pointerup', this._onDragEnd, this);
    canvas.stage.off('pointerupoutside', this._onDragEnd, this);
    this._redraw(false);
    this.onChange({ ...this.state });
  }

  /** External setter — updates state without firing onChange. */
  setState(next) {
    this.state = { ...this.state, ...next };
    this._redraw(this.dragging != null);
  }

  getState() {
    return { ...this.state };
  }

  destroy(options) {
    canvas.stage.off('pointermove', this._onDragMove, this);
    canvas.stage.off('pointerup', this._onDragEnd, this);
    canvas.stage.off('pointerupoutside', this._onDragEnd, this);
    super.destroy({ children: true, ...(options ?? {}) });
  }
}
