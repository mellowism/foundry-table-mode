const MODULE_ID = 'foundry-table-mode';
const COLOR = 0x00bcd4;
const COLOR_ACTIVE = 0xffc107;
const BORDER_WIDTH = 4;
const HANDLE_RADIUS = 26;
const LABEL = 'VTT Viewbox';
const MIN_SIZE = 200;
const DEFAULT_ASPECT = 16 / 9;

/**
 * CanvasLayer with a single GM-owned viewbox.
 * Left-click-drag the box → move. Left-click-drag the bottom-right handle → resize (aspect-locked).
 */
export class ViewboxOverlay extends foundry.canvas.layers.CanvasLayer {
  interactiveChildren = true;

  constructor({ x, y, width, height, aspect = DEFAULT_ASPECT, onChange }) {
    super();
    this.eventMode = 'static';
    this.state = { x, y, width, height };
    this.aspect = aspect;
    this.onChange = onChange ?? (() => {});
    this.dragging = null;

    this.container = new PIXI.Container();
    this.container.interactiveChildren = true;
    this.addChild(this.container);

    // Box — left-click-drag anywhere inside to move
    this.box = new PIXI.Graphics();
    this.box.eventMode = 'dynamic';
    this.box.cursor = 'move';
    this.container.addChild(this.box);
    this._bindDrag(this.box, 'move');

    // Label (passive)
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

    // Resize handle
    this.resizeHandle = new PIXI.Graphics();
    this.resizeHandle.eventMode = 'dynamic';
    this.resizeHandle.cursor = 'nwse-resize';
    this.container.addChild(this.resizeHandle);
    this._bindDrag(this.resizeHandle, 'resize');

    this._redraw();
  }

  _bindDrag(target, kind) {
    const self = this;
    const onMove = (ev) => {
      if (!self.dragging) return;
      const pos = self._sceneLocal(ev);
      self._applyDrag(pos);
    };
    const onEnd = () => {
      if (!self.dragging) return;
      target.off('globalpointermove', onMove);
      self._finishDrag();
    };
    target.on('pointerdown', (ev) => {
      ev.stopPropagation();
      const pos = self._sceneLocal(ev);
      self.dragging = { kind, origin: pos, start: { ...self.state } };
      self._redraw(true);
      console.log(`[${MODULE_ID}] drag start`, kind, pos);
      target.on('globalpointermove', onMove);
    });
    target.on('pointerup', onEnd);
    target.on('pointerupoutside', onEnd);
  }

  _sceneLocal(ev) {
    // PIXI v7 event → scene-space coords
    const data = ev.data ?? ev;
    if (data.getLocalPosition) return data.getLocalPosition(canvas.stage);
    return canvas.stage.toLocal(ev.global ?? data.global);
  }

  _applyDrag(pos) {
    const dx = pos.x - this.dragging.origin.x;
    const dy = pos.y - this.dragging.origin.y;
    const { kind, start } = this.dragging;

    if (kind === 'move') {
      this.state.x = start.x + dx;
      this.state.y = start.y + dy;
    } else if (kind === 'resize') {
      const deltaW = dx;
      const deltaH = dy * this.aspect;
      const delta = Math.max(deltaW, deltaH);
      const newW = Math.max(MIN_SIZE, start.width + delta);
      const newH = newW / this.aspect;
      this.state.width = newW;
      this.state.height = newH;
      this.state.x = start.x + (newW - start.width) / 2;
      this.state.y = start.y + (newH - start.height) / 2;
    }

    this._redraw(true);
  }

  _finishDrag() {
    this.dragging = null;
    this._redraw(false);
    this.onChange({ ...this.state });
  }

  _redraw(active = false) {
    const { x, y, width, height } = this.state;
    const color = active ? COLOR_ACTIVE : COLOR;
    const left = x - width / 2;
    const top = y - height / 2;
    this.container.position.set(left, top);

    this.box.clear();
    this.box.lineStyle(BORDER_WIDTH, color, 0.95);
    this.box.beginFill(color, 0.05);
    this.box.drawRect(0, 0, width, height);
    this.box.endFill();
    this.box.hitArea = new PIXI.Rectangle(0, 0, width, height);

    this.label.position.set(width / 2, -20);
    this.label.style.fill = color;

    const rh = this.resizeHandle;
    rh.clear();
    rh.lineStyle(2, 0xffffff, 1);
    rh.beginFill(color, 1);
    rh.drawCircle(0, 0, HANDLE_RADIUS);
    rh.endFill();
    rh.lineStyle(3, 0xffffff, 1);
    rh.moveTo(-10, -10); rh.lineTo(10, 10);
    rh.moveTo(4, 10); rh.lineTo(10, 10); rh.lineTo(10, 4);
    rh.moveTo(-4, -10); rh.lineTo(-10, -10); rh.lineTo(-10, -4);
    rh.hitArea = new PIXI.Circle(0, 0, HANDLE_RADIUS);
    rh.position.set(width, height);
  }

  setAspect(aspect) {
    if (!aspect || !isFinite(aspect) || aspect <= 0) return;
    if (Math.abs(this.aspect - aspect) < 0.001) return;
    this.aspect = aspect;
    this.state.height = this.state.width / aspect;
    this._redraw(this.dragging != null);
    this.onChange({ ...this.state });
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this._redraw(this.dragging != null);
  }

  getState() { return { ...this.state }; }

  destroy(options) {
    super.destroy({ children: true, ...(options ?? {}) });
  }
}
