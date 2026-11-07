'use strict'
// Spike renderer (nodeIntegration on, contextIsolation off: spike only).
const { ipcRenderer, sharedTexture } = require('electron')

const canvas = document.getElementById('c')
const video = document.getElementById('v')
const ov = document.getElementById('ov')
const lineEl = document.getElementById('line')
const popup = document.getElementById('popup')
const hud = document.getElementById('hud')

let cfg = null
const state = {
  frames: 0, firstFrameAt: 0, drawMsTotal: 0, drawMsMax: 0, lastW: 0, lastH: 0,
  rafFrames: 0, timePos: 0, hwdec: '', cues: [], currentText: null, drawErrors: 0,
}
window.__state = state
window.__frames = () => [state.frames, Date.now(), state.rafFrames]

// ---------- drawing ----------
let ctx2d = null
let gpu = null
const dpr = () => window.devicePixelRatio || 1

function fitCanvas() {
  const w = Math.round(window.innerWidth * dpr()), h = Math.round(window.innerHeight * dpr())
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
}

function letterbox(vw, vh, cw, ch) {
  const s = Math.min(cw / vw, ch / vh)
  return { x: (cw - vw * s) / 2, y: (ch - vh * s) / 2, w: vw * s, h: vh * s }
}

function draw2d(frame) {
  fitCanvas()
  if (!ctx2d) ctx2d = canvas.getContext('2d', { alpha: false })
  const r = letterbox(frame.displayWidth, frame.displayHeight, canvas.width, canvas.height)
  ctx2d.fillStyle = '#000'
  ctx2d.fillRect(0, 0, canvas.width, canvas.height)
  ctx2d.drawImage(frame, r.x, r.y, r.w, r.h)
}

const WGSL = `
struct U { rect: vec4f }
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var tex: texture_external;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f,6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  let q = p[i];
  var o: VO;
  o.pos = vec4f(mix(u.rect.x, u.rect.z, q.x), mix(u.rect.y, u.rect.w, q.y), 0.0, 1.0);
  o.uv = q;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f { return textureSampleBaseClampToEdge(tex, smp, i.uv); }
`

async function initWebGPU() {
  const adapter = await navigator.gpu.requestAdapter()
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  const format = navigator.gpu.getPreferredCanvasFormat()
  fitCanvas()
  context.configure({ device, format, alphaMode: 'opaque' })
  const module = device.createShaderModule({ code: WGSL })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  gpu = { device, context, pipeline, uniform, sampler, info: adapter.info ? { vendor: adapter.info.vendor, arch: adapter.info.architecture, desc: adapter.info.description } : {} }
}

function drawWebGPU(frame) {
  fitCanvas()
  const { device, context, pipeline, uniform, sampler } = gpu
  const r = letterbox(frame.displayWidth, frame.displayHeight, canvas.width, canvas.height)
  const cw = canvas.width, ch = canvas.height
  device.queue.writeBuffer(uniform, 0, new Float32Array([
    -1 + 2 * r.x / cw, 1 - 2 * r.y / ch, -1 + 2 * (r.x + r.w) / cw, 1 - 2 * (r.y + r.h) / ch,
  ]))
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: device.importExternalTexture({ source: frame }) },
    ],
  })
  const enc = device.createCommandEncoder()
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }],
  })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bind)
  pass.draw(6)
  pass.end()
  device.queue.submit([enc.finish()])
}

function onFrameDrawn(w, h) {
  state.frames++
  if (!state.firstFrameAt) {
    state.firstFrameAt = Date.now()
    ipcRenderer.send('first-frame', state.firstFrameAt)
  }
  if (w !== state.lastW || h !== state.lastH) { state.lastW = w; state.lastH = h; placeOverlay() }
}

async function handleSharedTexture({ importedSharedTexture }) {
  const t0 = performance.now()
  let frame
  try {
    frame = importedSharedTexture.getVideoFrame()
    if (cfg.draw === 'webgpu') drawWebGPU(frame); else draw2d(frame)
    const w = frame.displayWidth, h = frame.displayHeight
    const ms = performance.now() - t0
    state.drawMsTotal += ms
    state.drawMsMax = Math.max(state.drawMsMax, ms)
    onFrameDrawn(w, h)
  } catch (e) {
    state.drawErrors++
    state.lastError = String(e && e.stack || e)
  } finally {
    if (frame) frame.close()
    importedSharedTexture.release()
  }
}

// ---------- overlay ----------
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null

function placeOverlay() {
  if (!state.lastW) return
  const r = letterbox(state.lastW, state.lastH, canvas.width, canvas.height)
  const k = dpr()
  const rect = { x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k }
  ov.style.left = rect.x + 'px'; ov.style.top = rect.y + 'px'
  ov.style.width = rect.w + 'px'; ov.style.height = rect.h + 'px'
  const s = rect.h / 1080
  // ASS Default style: Noto Sans JP 64, white, 3 px outline, MarginV 60 (PlayRes 1920x1080).
  // libass sizes the font so that ascent+descent == Fontsize; for Noto Sans JP that is ~1.448 em.
  lineEl.style.fontSize = 64 * s / 1.448 + 'px'
  lineEl.style.bottom = 60 * s + 'px'
  lineEl.style.fontFamily = "'Noto Sans JP', 'Yu Gothic', sans-serif"
  lineEl.style.setProperty('--outline', 6 * s + 'px')
  for (const w of lineEl.querySelectorAll('.w')) w.style.webkitTextStrokeWidth = 6 * s + 'px'
}

function setLine(text) {
  if (text === state.currentText) return
  state.currentText = text
  lineEl.textContent = ''
  popup.style.display = 'none'
  if (!text) return
  for (const raw of text.split('\n')) {
    const row = document.createElement('div')
    const parts = segmenter ? [...segmenter.segment(raw)].map(x => x.segment) : [...raw]
    for (const p of parts) {
      const sp = document.createElement('span')
      sp.className = 'w'
      sp.textContent = p
      row.appendChild(sp)
    }
    lineEl.appendChild(row)
  }
  placeOverlay()
}

lineEl.addEventListener('click', (e) => {
  const t = e.target
  if (!t.classList || !t.classList.contains('w')) return
  popup.textContent = 'clicked: ' + t.textContent
  popup.dataset.word = t.textContent
  popup.style.display = 'block'
  const b = t.getBoundingClientRect()
  popup.style.left = Math.max(4, b.left) + 'px'
  popup.style.top = Math.max(4, b.top - 52) + 'px'
})

window.__overlayTest = () => {
  const sp = lineEl.querySelector('.w')
  if (!sp) return { skipped: true, reason: 'no word spans on screen' }
  const b = sp.getBoundingClientRect()
  const x = b.left + b.width / 2, y = b.top + b.height / 2
  const hit = document.elementFromPoint(x, y)
  const hitOk = hit === sp
  sp.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))
  const popupOk = popup.style.display === 'block' && popup.dataset.word === sp.textContent
  return { skipped: false, word: sp.textContent, x, y, hitOk, hitTag: hit && (hit.className || hit.tagName), popupOk, popupText: popup.textContent }
}
window.__overlayText = () => lineEl.textContent
window.__overlayWordCount = () => lineEl.querySelectorAll('.w').length

// ---------- properties from mpv ----------
function cueAt(t) {
  const c = state.cues.find(c => t >= c.start && t < c.end)
  return c ? c.text : ''
}

ipcRenderer.on('prop', (_e, name, value) => {
  if (name === 'time-pos') {
    state.timePos = parseFloat(value) || 0
    if (cfg.submode === 'hybrid') setLine(cueAt(state.timePos))
  } else if (name === 'sub-text' && cfg.submode === 'overlay') {
    setLine(value || '')
  } else if (name === 'hwdec-current') {
    state.hwdec = value || ''
  }
})
ipcRenderer.on('cues', (_e, cues) => { state.cues = cues })

setInterval(() => {
  hud.textContent = `t=${state.timePos.toFixed(2)}s  frames=${state.frames}\nhwdec=${state.hwdec || '-'}  ${state.lastW}x${state.lastH}  draw=${cfg && cfg.draw}`
}, 250)

// ---------- html mode ----------
window.__htmlState = () => {
  const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : {}
  return {
    currentTime: video.currentTime, paused: video.paused, readyState: video.readyState,
    networkState: video.networkState, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
    error: video.error ? { code: video.error.code, message: video.error.message } : null,
    dropped: q.droppedVideoFrames, total: q.totalVideoFrames, frames: state.frames,
    audioTracks: video.audioTracks ? video.audioTracks.length : undefined,
  }
}

function startHtml() {
  canvas.style.display = 'none'
  video.style.display = 'block'
  video.addEventListener('error', () => ipcRenderer.send('html-error', video.error && { code: video.error.code, message: video.error.message }))
  const tick = (_now, meta) => {
    state.frames++
    if (!state.firstFrameAt) { state.firstFrameAt = Date.now(); ipcRenderer.send('first-frame', state.firstFrameAt) }
    state.timePos = meta.mediaTime
    video.requestVideoFrameCallback(tick)
  }
  video.requestVideoFrameCallback(tick)
  video.src = cfg.fileUrl
  video.muted = true
  video.play().catch(e => ipcRenderer.send('html-error', { code: -1, message: String(e) }))
}

// ---------- boot ----------
let rafLast = 0
function raf(now) { state.rafFrames++; rafLast = now; requestAnimationFrame(raf) }

;(async () => {
  cfg = await ipcRenderer.invoke('get-config')
  requestAnimationFrame(raf)
  if (cfg.mode === 'html') {
    startHtml()
  } else {
    if (cfg.draw === 'webgpu') await initWebGPU()
    sharedTexture.setSharedTextureReceiver(handleSharedTexture)
  }
  ipcRenderer.send('renderer-ready', { draw: cfg.draw, gpu: gpu && gpu.info })
  window.addEventListener('resize', () => { fitCanvas(); placeOverlay() })
  setInterval(() => ipcRenderer.send('fps-report', { frames: state.frames, raf: state.rafFrames, at: Date.now() }), 1000)
})()
