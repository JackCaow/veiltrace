import { decodeRGBA } from '/dist/core/index.js'
self.onmessage = ({ data: { id, image, options } }) => {
  try {
    self.postMessage({
      id,
      result: decodeRGBA(image, options) || { status: 'not_found', authenticated: false },
    })
  } catch (error) {
    self.postMessage({ id, error: error.message })
  }
}
