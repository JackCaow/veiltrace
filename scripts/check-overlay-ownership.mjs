import assert from 'node:assert/strict'

/** Exercise the actual SDK in the browser, including a host with no positioned ancestor. */
export async function checkOverlayOwnership(page) {
  const result = await page.evaluate(async () => {
    const { ScreenOverlay } = await import('/dist/browser/index.js')
    const host = document.createElement('div')
    Object.assign(host.style, { width: '400px', height: '300px', background: '#1c1e22' })
    document.body.append(host)
    const before = {
      position: host.style.position,
      isolation: host.style.isolation,
      willChange: host.style.willChange,
    }
    const first = new ScreenOverlay({ target: host, recordId: '123456abcdef' })
    const rectangle = firstRect()
    function firstRect() {
      const rect = host.querySelector('[data-veiltrace]').getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    let duplicateRejected = false
    try {
      new ScreenOverlay({ target: host, recordId: 'abcdef123456' })
    } catch (error) {
      duplicateRejected = error.message.includes('already has an active')
    }
    // A freshly loaded module has a separate WeakMap (as with HMR/duplicate bundles).
    const { ScreenOverlay: ReloadedOverlay } = await import(
      '/dist/browser/index.js?ownership-regression=1'
    )
    let reloadedDuplicateRejected = false
    try {
      new ReloadedOverlay({ target: host, recordId: 'abcdef123456' })
    } catch (error) {
      reloadedDuplicateRejected = error.message.includes('already has an active')
    }
    const afterDuplicate = firstRect(),
      layers = host.querySelectorAll('[data-veiltrace]').length
    first.dispose()
    first.dispose()
    const restored = Object.keys(before).every((key) => host.style[key] === before[key])
    const replacement = new ScreenOverlay({ target: host, recordId: 'abcdef123456' })
    first.dispose() // An old owner cannot unregister the replacement.
    let staleOwnerProtected = false
    try {
      new ScreenOverlay({ target: host, recordId: '000000000001' })
    } catch (error) {
      staleOwnerProtected = error.message.includes('already has an active')
    }
    replacement.dispose()
    const invalidHost = document.createElement('div')
    document.body.append(invalidHost)
    try {
      new ScreenOverlay({ target: invalidHost, recordId: 'invalid' })
    } catch {}
    const afterFailure = new ScreenOverlay({ target: invalidHost, recordId: '123456abcdef' })
    try {
      afterFailure.update({ recordId: 'invalid' })
    } catch {}
    const afterUpdateFailure = new ScreenOverlay({ target: invalidHost, recordId: 'abcdef123456' })
    afterUpdateFailure.dispose()
    const clean =
      host.querySelectorAll('[data-veiltrace]').length === 0 &&
      invalidHost.querySelectorAll('[data-veiltrace]').length === 0
    host.remove()
    invalidHost.remove()
    return {
      duplicateRejected,
      reloadedDuplicateRejected,
      rectangle,
      afterDuplicate,
      layers,
      restored,
      staleOwnerProtected,
      clean,
    }
  })
  assert.equal(result.duplicateRejected, true)
  assert.equal(result.reloadedDuplicateRejected, true)
  assert.equal(result.layers, 2)
  assert.deepEqual(result.afterDuplicate, result.rectangle)
  assert.equal(result.rectangle.width, 400)
  assert.equal(result.rectangle.height, 300)
  assert.equal(result.restored, true)
  assert.equal(result.staleOwnerProtected, true)
  assert.equal(result.clean, true)
  return result
}
