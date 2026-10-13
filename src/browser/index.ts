import { createLayers, type Options } from '../core/index.js'
export interface OverlayOptions extends Options {
  target: HTMLElement
  recordId: string
}

/** Browser/Electron Renderer adapter. No Node integration or native module required. */
export class ScreenOverlay {
  private readonly target: HTMLElement
  private readonly positive: HTMLDivElement
  private readonly negative: HTMLDivElement
  private readonly oldPosition: string
  private readonly oldIsolation: string
  private readonly oldWillChange: string
  private ownedWillChange = ''
  private patchedPosition = false
  private patchedIsolation = false
  private disposed = false
  private readonly resize = () => {
    const view = this.target.ownerDocument.defaultView!
    const ratio = view.devicePixelRatio || 1
    const size = `${256 / ratio}px ${256 / ratio}px`
    this.positive.style.backgroundSize = this.negative.style.backgroundSize = size
    // Blending on the host's antialiased rounded boundary can double its coverage
    // in Chromium. Leave a two-device-pixel guard inside the host clip instead.
    const style = view.getComputedStyle(this.target)
    const clip = `inset(${2 / ratio}px round ${style.borderRadius || '0px'})`
    this.positive.style.clipPath = this.negative.style.clipPath = clip
  }
  constructor(options: OverlayOptions) {
    const { target } = options
    if (!target?.ownerDocument?.defaultView) throw new Error('A browser HTMLElement is required')
    const view = target.ownerDocument.defaultView
    if (
      !view.CSS?.supports('mix-blend-mode', 'plus-lighter') ||
      !view.CSS.supports('mix-blend-mode', 'difference')
    )
      throw new Error('Required blend modes are unsupported')
    this.target = target
    this.oldPosition = target.style.position
    this.oldIsolation = target.style.isolation
    this.oldWillChange = target.style.willChange
    this.positive = this.layer('positive', 'plus-lighter', 2147483645)
    this.negative = this.layer('negative', 'difference', 2147483646)
    const urls = this.urls(options)
    if (view.getComputedStyle(target).position === 'static') {
      target.style.position = 'relative'
      this.patchedPosition = true
    }
    if (view.getComputedStyle(target).isolation !== 'isolate') {
      target.style.isolation = 'isolate'
      this.patchedIsolation = true
    }
    // Keep the host's compositing surface stable when marks are toggled. Without
    // this, Linux Chromium may switch glyphs between LCD and grayscale AA.
    const hint = view.getComputedStyle(target).willChange
    if (
      !hint
        .split(',')
        .map((value) => value.trim())
        .includes('opacity')
    ) {
      this.ownedWillChange = hint === 'auto' ? 'opacity' : `${hint}, opacity`
      target.style.willChange = this.ownedWillChange
    }
    this.positive.style.backgroundImage = `url("${urls[0]}")`
    this.negative.style.backgroundImage = `url("${urls[1]}")`
    target.append(this.positive, this.negative)
    this.resize()
    view.addEventListener('resize', this.resize)
  }
  private layer(name: string, blend: string, zIndex: number) {
    const layer = this.target.ownerDocument.createElement('div')
    layer.dataset.veiltrace = name
    layer.setAttribute('aria-hidden', 'true')
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      userSelect: 'none',
      backgroundRepeat: 'repeat',
      backgroundSize: '256px 256px',
      mixBlendMode: blend,
      zIndex: String(zIndex),
    })
    return layer
  }
  private urls(options: Omit<OverlayOptions, 'target'>) {
    const layers = createLayers(options.recordId, options)
    return [layers.positive, layers.negative].map(({ width, height, data }) => {
      const canvas = this.target.ownerDocument.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable')
      const image = context.createImageData(width, height)
      image.data.set(data)
      context.putImageData(image, 0, 0)
      return canvas.toDataURL('image/png')
    })
  }
  update(options: Omit<OverlayOptions, 'target'>): void {
    if (this.disposed) throw new Error('Overlay has been disposed')
    try {
      const urls = this.urls(options)
      this.positive.style.backgroundImage = `url("${urls[0]}")`
      this.negative.style.backgroundImage = `url("${urls[1]}")`
    } catch (error) {
      this.dispose()
      throw error
    }
  }
  setEnabled(enabled: boolean): void {
    if (this.disposed) throw new Error('Overlay has been disposed')
    this.positive.hidden = this.negative.hidden = !enabled
  }
  dispose(): void {
    if (this.disposed) return
    this.positive.remove()
    this.negative.remove()
    this.target.ownerDocument.defaultView?.removeEventListener('resize', this.resize)
    if (this.patchedPosition && this.target.style.position === 'relative')
      this.target.style.position = this.oldPosition
    if (this.patchedIsolation && this.target.style.isolation === 'isolate')
      this.target.style.isolation = this.oldIsolation
    if (this.ownedWillChange && this.target.style.willChange === this.ownedWillChange)
      this.target.style.willChange = this.oldWillChange
    this.disposed = true
  }
}
