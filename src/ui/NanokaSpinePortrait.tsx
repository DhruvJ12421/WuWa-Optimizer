import { useEffect, useRef, useState } from 'react'
import type { SkeletonData } from '@pixi-spine/all-4.1'

type PortraitStatus = 'idle' | 'loading' | 'ready' | 'error' | 'reduced-motion'

interface NanokaSpinePortraitProps {
  skeletonSourceUrl: string
  atlasSourceUrl: string
  onReady: () => void
  onFallback: () => void
}

interface SpineResource {
  spineData: SkeletonData
}

export function NanokaSpinePortrait({ skeletonSourceUrl, atlasSourceUrl, onReady, onFallback }: NanokaSpinePortraitProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<PortraitStatus>('idle')

  useEffect(() => {
    const host = hostRef.current
    if (!host || !skeletonSourceUrl || !atlasSourceUrl) {
      setStatus('error')
      onFallback()
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStatus('reduced-motion')
      onFallback()
      return
    }

    let disposed = false
    let app: import('pixi.js').Application | undefined
    let resizeObserver: ResizeObserver | undefined
    const disposeRuntime = () => {
      resizeObserver?.disconnect()
      resizeObserver = undefined
      app?.destroy(true, { children: true, texture: false, baseTexture: false })
      app = undefined
    }
    setStatus('loading')
    onFallback()

    void (async () => {
      try {
        const [{ Application, Assets }, { Spine }] = await Promise.all([
          import('pixi.js'),
          import('@pixi-spine/all-4.1')
        ])
        if (disposed) return

        const runtimeApp = new Application({
          width: Math.max(host.clientWidth, 1),
          height: Math.max(host.clientHeight, 1),
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2)
        })
        app = runtimeApp
        const canvas = runtimeApp.view as HTMLCanvasElement
        canvas.setAttribute('aria-hidden', 'true')
        host.replaceChildren(canvas)

        const resource = await Assets.load<SpineResource>({
          src: skeletonSourceUrl,
          data: { spineAtlasFile: atlasSourceUrl }
        })
        if (disposed) {
          disposeRuntime()
          return
        }

        const portrait = new Spine(resource.spineData)
        portrait.autoUpdate = true
        const animation = portrait.spineData.animations.find((entry) => entry.name.toLowerCase() === 'idle')
          ?? portrait.spineData.animations[0]
        if (animation) portrait.state.setAnimation(0, animation.name, true)
        runtimeApp.stage.addChild(portrait)

        const fitPortrait = () => {
          if (disposed) return
          const width = Math.max(host.clientWidth, 1)
          const height = Math.max(host.clientHeight, 1)
          runtimeApp.renderer.resize(width, height)
          portrait.update(0)
          const bounds = portrait.getLocalBounds()
          if (!bounds.width || !bounds.height) return
          const scale = Math.min(width / bounds.width, height / bounds.height) * 1.02
          portrait.scale.set(scale)
          portrait.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
          portrait.position.set(width / 2, height / 2)
        }
        fitPortrait()
        resizeObserver = new ResizeObserver(fitPortrait)
        resizeObserver.observe(host)
        setStatus('ready')
        onReady()
      } catch (error) {
        if (disposed) return
        disposeRuntime()
        console.warn('Nanoka animated portrait could not be loaded.', error)
        host.replaceChildren()
        setStatus('error')
        onFallback()
      }
    })()

    return () => {
      disposed = true
      disposeRuntime()
    }
  }, [atlasSourceUrl, onFallback, onReady, skeletonSourceUrl])

  return <div ref={hostRef} className={`cs-live-portrait is-${status}`} data-status={status} aria-hidden="true" />
}
