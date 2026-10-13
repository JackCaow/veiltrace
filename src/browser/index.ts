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
  private enabled = true
  private currentUrls: string[]
  private readonly neutralUrl: string
  private readonly resize = () => {
    const view = this.target.ownerDocument.defaultView!
    const ratio = view.devicePixelRatio || 1
    const size = `${256 / ratio}px ${256 / ratio}px`
    this.positive.style.backgroundSize = this.negative.style.backgroundSize = size
    const clip = `inset(${2 / ratio}px)`
    this.positive.style.clipPath = this.negative.style.clipPath = clip
  }
  constructor(options: OverlayOptions) {
    const { target } = options
    if (!target?.ownerDocument?.defaultView) throw new Error('A browser HTMLElement is required')
    const view = target.ownerDocument.defaultView
    const geometry = view.getComputedStyle(target)
    if (
      [
        geometry.borderTopLeftRadius,
        geometry.borderTopRightRadius,
        geometry.borderBottomRightRadius,
        geometry.borderBottomLeftRadius,
      ].some((radius) => !/^0(?:px|%)?(?: 0(?:px|%)?)?$/.test(radius))
    ) {
      throw new Error(
        'Use a rectangular viewport host; rounded hosts are not supported in this alpha',
      )
    }
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
    this.currentUrls = urls
    const neutral = target.ownerDocument.createElement('canvas')
    neutral.width = neutral.height = 256
    const neutralContext = neutral.getContext('2d')
    if (!neutralContext) throw new Error('Canvas is unavailable')
    neutralContext.fillStyle = '#000'
    neutralContext.fillRect(0, 0, 256, 256)
    this.neutralUrl = neutral.toDataURL('image/png')
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
    this.applyImages()
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
      this.currentUrls = this.urls(options)
      this.applyImages()
    } catch (error) {
      this.dispose()
      throw error
    }
  }
  setEnabled(enabled: boolean): void {
    if (this.disposed) throw new Error('Overlay has been disposed')
    this.enabled = enabled
    this.applyImages()
  }
  private applyImages(): void {
    // Keep neutral blend layers mounted while disabled. Hiding them changes the
    // host's rounded-clip rasterization in Linux Chromium even with no carrier.
    const urls = this.enabled ? this.currentUrls : [this.neutralUrl, this.neutralUrl]
    this.positive.style.backgroundImage = `url("${urls[0]}")`
    this.negative.style.backgroundImage = `url("${urls[1]}")`
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
