'use strict'
// Spike main process. Configured entirely through env vars (never argv URLs).
//   SPIKE_FILE, SPIKE_MODE=mpv|html|probe, SPIKE_SUBMODE=libass|overlay|hybrid, SPIKE_AUTO=1, SPIKE_OUT=<json>,
//   SPIKE_MPV_DLL, SPIKE_SCENARIO=metrics|subs, SPIKE_EXTRA=1 (audio switch + seek), SPIKE_FPS (container fps),
//   SPIKE_SYNC=query|keyedmutex, SPIKE_DRAW=2d|webgpu, SPIKE_ADAPTER=nvidia|intel, SPIKE_RING, SPIKE_DURATION, SPIKE_LABEL
const { app, BrowserWindow, ipcMain, sharedTexture } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { pathToFileURL } = require('url')

// Work folder holding libmpv\ and media\ (see README.md); logs and screenshots go to spike-logs\.
const S = process.env.SPIKE_S
if (!S) {
  console.error('Set SPIKE_S to the spike work folder (see README.md).')
  process.exit(2)
}
const LOGS = path.join(S, 'spike-logs')
const SHOTS = path.join(LOGS, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const env = process.env
const cfg = {
  file: env.SPIKE_FILE || '',
  mode: env.SPIKE_MODE || 'mpv',
  submode: env.SPIKE_SUBMODE || 'overlay',
  auto: env.SPIKE_AUTO === '1',
  out: env.SPIKE_OUT || path.join(LOGS, 'spike-out.json'),
  dll: env.SPIKE_MPV_DLL || path.join(S, 'libmpv', 'libmpv-2.dll'),
  scenario: env.SPIKE_SCENARIO || 'metrics',
  extra: env.SPIKE_EXTRA === '1',
  fps: Number(env.SPIKE_FPS) || 0,
  sync: env.SPIKE_SYNC || 'query',
  draw: env.SPIKE_DRAW || '2d',
  adapter: env.SPIKE_ADAPTER || '',
  ring: Number(env.SPIKE_RING) || 3,
  block: env.SPIKE_BLOCK !== '0',
  duration: Number(env.SPIKE_DURATION) || 20,
  label: env.SPIKE_LABEL || 'run',
}
cfg.fileUrl = cfg.file ? pathToFileURL(cfg.file).href : ''
const baseName = cfg.file ? path.basename(cfg.file, path.extname(cfg.file)) : 'none'

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.setPath('userData', path.join(S, 'spike-profile'))

const R = { config: { ...cfg }, startedAt: Date.now(), errors: [], notes: [] }
const logPath = path.join(LOGS, `electron-${cfg.label}.log`)
function log(...a) {
  const line = `[${((Date.now() - R.startedAt) / 1000).toFixed(3)}] ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}\n`
  try { fs.appendFileSync(logPath, line) } catch {}
  if (!cfg.auto) process.stdout.write(line)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(cond, timeoutMs, stepMs = 50) {
  const t0 = Date.now()
  for (;;) {
    const v = await cond()
    if (v) return v
    if (Date.now() - t0 > timeoutMs) return null
    await sleep(stepMs)
  }
}
function writeResult(extra) {
  Object.assign(R, extra)
  fs.writeFileSync(cfg.out, JSON.stringify(R, null, 2))
}
process.on('uncaughtException', (e) => { log('uncaught', String(e && e.stack || e)); R.errors.push(String(e && e.stack || e)); try { writeResult({ crashed: true }) } catch {}; app.exit(2) })
process.on('unhandledRejection', (e) => { log('unhandledRejection', String(e && e.stack || e)); R.errors.push('unhandledRejection: ' + String(e && e.stack || e)) })

// ---------------------------------------------------------------- probe
async function probe() {
  const win = new BrowserWindow({ width: 200, height: 200, show: false, webPreferences: { offscreen: { useSharedTexture: true } } })
  const out = { events: 0 }
  await new Promise((resolve) => {
    win.webContents.on('paint', (event) => {
      const tex = event.texture
      if (!tex) { out.noTexture = true; return resolve() }
      const info = tex.textureInfo
      const nt = info.handle && info.handle.ntHandle
      out.pixelFormat = info.pixelFormat
      out.codedSize = info.codedSize
      out.ntHandle = nt ? { isBuffer: Buffer.isBuffer(nt), length: nt.length, hex: nt.toString('hex'), le: nt.length >= 8 ? nt.readBigUInt64LE(0).toString() : (nt.length >= 4 ? nt.readUInt32LE(0) : null) } : null
      out.keys = Object.keys(info)
      tex.release()
      out.events++
      resolve()
    })
    win.loadURL('data:text/html,<body style="background:#08f"><h1>probe</h1></body>')
    setTimeout(resolve, 5000)
  })
  log('probe', out)
  writeResult({ probe: out })
  app.quit()
}

// ---------------------------------------------------------------- metrics helpers
let nvLatest = null
let nvProc = null
function startNvidia() {
  try {
    nvProc = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,utilization.decoder,memory.used', '--format=csv,noheader,nounits', '-l', '1'], { windowsHide: true })
    let buf = ''
    nvProc.stdout.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
        const p = line.split(',').map(s => Number(s.trim()))
        if (p.length === 3 && p.every(Number.isFinite)) nvLatest = { gpu: p[0], decoder: p[1], memMB: p[2] }
      }
    })
    nvProc.on('error', (e) => { R.notes.push('nvidia-smi failed: ' + e.message) })
  } catch (e) { R.notes.push('nvidia-smi failed: ' + e.message) }
}
function stopNvidia() { try { nvProc && nvProc.kill() } catch {} }

const MPV_PROPS = ['hwdec-current', 'video-codec', 'audio-codec-name', 'container-fps', 'estimated-vf-fps', 'frame-drop-count',
  'decoder-frame-drop-count', 'vo-delayed-frame-count', 'time-pos', 'dwidth', 'dheight']

let win = null
let player = null
let rendererStats = null // pulled counters
const fx = { firstFrameAt: 0, htmlError: null, lastFpsReport: null }

async function pullRenderer() {
  const [frames, at, raf] = await win.webContents.executeJavaScript('window.__frames()')
  return { frames, at, raf }
}

function collectProcess(metrics) {
  const pidR = win.webContents.getOSProcessId()
  const pick = (m) => m ? { cpu: m.cpu.percentCPUUsage, ramMB: +(m.memory.workingSetSize / 1024).toFixed(1) } : null
  const browser = metrics.find(m => m.type === 'Browser')
  const gpuP = metrics.find(m => m.type === 'GPU')
  const rend = metrics.find(m => m.pid === pidR)
  return { browser: pick(browser), gpu: pick(gpuP), renderer: pick(rend) }
}

function mean(a) { const v = a.filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null }
const r1 = x => x == null ? null : Math.round(x * 10) / 10

function bitmapStats(img) {
  const size = img.getSize()
  const bmp = img.toBitmap() // BGRA
  const step = 16
  let sum = 0, n = 0
  const sample = []
  for (let y = 0; y < size.height; y += step) {
    for (let x = 0; x < size.width; x += step) {
      const o = (y * size.width + x) * 4
      const b = bmp[o], g = bmp[o + 1], r = bmp[o + 2]
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      n++
      sample.push(r, g, b)
    }
  }
  return { size, meanLum: sum / n, sample, bmp }
}
function sampleDiff(a, b) {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i])
  return s / n
}
// Colour census inside the video rectangle (for the ASS checks).
function censusBitmap(st, region) {
  const { size, bmp } = st
  const x0 = Math.floor(size.width * region[0]), x1 = Math.floor(size.width * region[2])
  const y0 = Math.floor(size.height * region[1]), y1 = Math.floor(size.height * region[3])
  let yellow = 0, white = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const o = (y * size.width + x) * 4
    const b = bmp[o], g = bmp[o + 1], r = bmp[o + 2]
    if (r > 215 && g > 190 && b < 90) yellow++
    else if (r > 235 && g > 235 && b > 235) white++
  }
  return { yellow, white }
}

async function shot(name) {
  const img = await win.webContents.capturePage()
  const file = path.join(SHOTS, `${cfg.label}-${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  const st = bitmapStats(img)
  return { file, st }
}

// ---------------------------------------------------------------- ASS helpers (hybrid mode)
function parseAss(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const head = []
  let format = null
  const events = []
  let section = ''
  for (const line of lines) {
    const m = /^\[(.+)\]$/.exec(line.trim())
    if (m) { section = m[1]; if (section !== 'Events') head.push(line); else head.push(line); continue }
    if (section !== 'Events') { head.push(line); continue }
    if (line.startsWith('Format:')) { format = line.slice(7).split(',').map(s => s.trim()); head.push(line); continue }
    if (line.startsWith('Dialogue:')) {
      const parts = line.slice(9).trim().split(',')
      const fields = {}
      format.forEach((k, i) => { fields[k] = i === format.length - 1 ? parts.slice(i).join(',') : parts[i] })
      const t = s => { const [h, mi, se] = s.trim().split(':'); return Number(h) * 3600 + Number(mi) * 60 + Number(se) }
      events.push({ raw: line, style: fields.Style, text: fields.Text, start: t(fields.Start), end: t(fields.End) })
    }
  }
  return { head, events }
}
const plainText = s => s.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n')
function isSign(e) { return e.style !== 'Default' || /\\(pos|move|an\d)/.test(e.text) }

function prepareHybrid() {
  const src = path.join(S, 'media', 'subs-ja.ass')
  const ass = parseAss(fs.readFileSync(src, 'utf8'))
  const signs = ass.events.filter(isSign)
  const dialogue = ass.events.filter(e => !isSign(e))
  const outFile = path.join(LOGS, 'signs-only.ass')
  fs.writeFileSync(outFile, '\uFEFF' + ass.head.join('\n') + '\n' + signs.map(e => e.raw).join('\n') + '\n', 'utf8')
  R.hybrid = { signsOnly: outFile, signCount: signs.length, dialogueCount: dialogue.length }
  return { file: outFile, cues: dialogue.map(e => ({ start: e.start, end: e.end, text: plainText(e.text) })) }
}

// ---------------------------------------------------------------- mpv pipeline
const pipeline = { sends: 0, inflight: 0, timeouts: 0, importErrors: 0, sendErrors: 0, droppedNoCapacity: 0, sendMsTotal: 0, sendMsMax: 0, firstErrors: [] }
const props = {}
const subTextEvents = []
const mpvLogs = []

function startPlayer(adapter) {
  const { Player } = require('./miteiru_node.node')
  const mpvOptions = {
    'log-file': path.join(LOGS, `mpv-${baseName}-${cfg.submode}.log`),
    mute: 'yes', // keep the test PC quiet; audio still decodes
  }
  const pl = player = new Player({
    dllPath: cfg.dll, adapter, ringSize: cfg.ring, sync: cfg.sync, blockForTargetTime: cfg.block,
    logFile: path.join(LOGS, `player-${cfg.label}.log`), mpvOptions,
  })
  R.adapterInfo = player.adapterInfo()
  log('player created on', R.adapterInfo)
  player.onEvent((e) => {
    if (e.type === 'property') {
      props[e.name] = e.value
      if (e.name === 'sub-text') subTextEvents.push({ t: Date.now() - R.startedAt, v: e.value })
      if (win && !win.isDestroyed()) win.webContents.send('prop', e.name, e.value)
    } else if (e.type === 'log') {
      mpvLogs.push(`${e.level} [${e.prefix}] ${(e.text || '').trim()}`)
    } else if (e.type === 'end-file') {
      R.endFile = { reason: e.reason, error: e.error }
      log('end-file', R.endFile)
    } else {
      if (e.type === 'file-loaded') fx.fileLoaded = true
      log('event', e.type)
    }
  })
  player.onFrame(async (f) => {
    if (!win || win.isDestroyed() || pipeline.inflight >= cfg.ring - 1) {
      pipeline.droppedNoCapacity++
      try { pl.releaseSlot(f.slot) } catch {}
      return
    }
    let imported
    try {
      imported = sharedTexture.importSharedTexture({
        textureInfo: {
          pixelFormat: 'bgra',
          codedSize: { width: f.width, height: f.height },
          visibleRect: { x: 0, y: 0, width: f.width, height: f.height },
          timestamp: f.timestampUs,
          handle: { ntHandle: f.ntHandle },
        },
        allReferencesReleased: () => { try { pl.releaseSlot(f.slot) } catch {} },
      })
    } catch (e) {
      pipeline.importErrors++
      if (pipeline.firstErrors.length < 5) pipeline.firstErrors.push('import: ' + String(e && e.message || e))
      try { pl.releaseSlot(f.slot) } catch {}
      return
    }
    pipeline.inflight++
    const t0 = performance.now()
    try {
      await sharedTexture.sendSharedTexture({ frame: win.webContents.mainFrame, importedSharedTexture: imported })
      pipeline.sends++
      const ms = performance.now() - t0
      pipeline.sendMsTotal += ms
      pipeline.sendMsMax = Math.max(pipeline.sendMsMax, ms)
    } catch (e) {
      const msg = String(e && e.message || e)
      if (/timeout|timed out/i.test(msg)) pipeline.timeouts++; else pipeline.sendErrors++
      if (pipeline.firstErrors.length < 5) pipeline.firstErrors.push('send: ' + msg)
    } finally {
      pipeline.inflight--
      try { imported.release() } catch {}
    }
  })
  player.observe(['time-pos', 'sub-text', 'hwdec-current', 'eof-reached', 'aid', 'pause'])
}

async function applySubmode() {
  const hasSubs = /ass/.test(baseName)
  if (cfg.submode === 'libass') {
    if (hasSubs) player.setProperty('sid', '1')
    player.setProperty('sub-visibility', 'yes')
  } else if (cfg.submode === 'overlay') {
    if (hasSubs) player.setProperty('sid', '1')
    player.setProperty('sub-visibility', 'no')
  } else if (cfg.submode === 'hybrid') {
    const h = prepareHybrid()
    win.webContents.send('cues', h.cues)
    player.command(['sub-add', h.file, 'select'])
    player.setProperty('sub-visibility', 'yes')
  }
}

function mpvSnapshot() {
  const o = {}
  for (const p of MPV_PROPS) o[p] = player.getProperty(p)
  return o
}

// ---------------------------------------------------------------- scenarios
async function scenarioMetrics() {
  const out = { samples: [], shots: {} }
  const isMpv = cfg.mode === 'mpv'
  const first = await waitFor(() => fx.firstFrameAt, 20000)
  out.firstFrameMs = first ? first - fx.loadAt : null
  if (!first) {
    out.failure = 'no first frame within 20 s'
    if (!isMpv) out.htmlState = await win.webContents.executeJavaScript('window.__htmlState()')
    out.htmlError = fx.htmlError
    return out
  }
  let procBase = app.getAppMetrics()
  const base = await pullRenderer()
  const t0 = Date.now()
  let prev = base
  const shotStats = {}
  for (let i = 1; i <= cfg.duration; i++) {
    await sleep(Math.max(0, t0 + i * 1000 - Date.now()))
    const metrics = collectProcess(app.getAppMetrics())
    const cur = await pullRenderer()
    const s = {
      i, t: (Date.now() - t0) / 1000,
      cpu: { browser: metrics.browser && metrics.browser.cpu, gpu: metrics.gpu && metrics.gpu.cpu, renderer: metrics.renderer && metrics.renderer.cpu },
      ramMB: { browser: metrics.browser && metrics.browser.ramMB, gpu: metrics.gpu && metrics.gpu.ramMB, renderer: metrics.renderer && metrics.renderer.ramMB },
      rendererFps: (cur.frames - prev.frames) / ((cur.at - prev.at) / 1000),
      rafFps: (cur.raf - prev.raf) / ((cur.at - prev.at) / 1000),
      nv: nvLatest,
    }
    if (isMpv) s.mpv = mpvSnapshot()
    out.samples.push(s)
    prev = cur
    if (i === 2 && cfg.scenario === 'metrics') {
      try { out.overlayTest = await win.webContents.executeJavaScript('window.__overlayTest()') } catch (e) { out.overlayTest = { error: String(e) } }
      out.overlayTextAt2s = await win.webContents.executeJavaScript('window.__overlayText()')
    }
    if (i === 3 || i === 6) {
      const sh = await shot(`${baseName}-${cfg.mode}-t${i}`)
      shotStats[i] = sh.st
      out.shots[`t${i}`] = { file: sh.file, meanLum: r1(sh.st.meanLum), pctLum: r1(sh.st.meanLum / 255 * 100) }
    }
  }
  const end = prev
  if (shotStats[3] && shotStats[6]) {
    const d = sampleDiff(shotStats[3].sample, shotStats[6].sample)
    out.shots.meanAbsDiff = r1(d)
    out.shots.differ = d > 0.5
    out.shots.notBlack = shotStats[3].meanLum / 255 > 0.05 && shotStats[6].meanLum / 255 > 0.05
  }
  // aggregate
  const sm = out.samples
  const m = (f) => r1(mean(sm.map(f)))
  out.summary = {
    windowSeconds: (end.at - base.at) / 1000,
    rendererFrames: end.frames - base.frames,
    rendererFps: r1((end.frames - base.frames) / ((end.at - base.at) / 1000)),
    rafFps: r1((end.raf - base.raf) / ((end.at - base.at) / 1000)),
    minSecondFps: r1(Math.min(...sm.map(s => s.rendererFps))),
    cpu: { browser: m(s => s.cpu.browser), gpu: m(s => s.cpu.gpu), renderer: m(s => s.cpu.renderer) },
    ramMB: { browser: m(s => s.ramMB.browser), gpu: m(s => s.ramMB.gpu), renderer: m(s => s.ramMB.renderer) },
    nvGpuPct: m(s => s.nv && s.nv.gpu), nvDecoderPct: m(s => s.nv && s.nv.decoder), nvMemMB: m(s => s.nv && s.nv.memMB),
  }
  if (isMpv) {
    const last = sm[sm.length - 1].mpv
    out.summary.mpv = last
    const dropped = (Number(last['frame-drop-count']) || 0) + (Number(last['decoder-frame-drop-count']) || 0)
    out.summary.droppedFrames = dropped
    const containerFps = Number(last['container-fps']) || cfg.fps
    out.summary.containerFps = containerFps
    out.summary.expectedFrames = containerFps * out.summary.windowSeconds
    out.summary.dropPct = r1(dropped / out.summary.expectedFrames * 100)
    out.summary.fpsRatio = r1(out.summary.rendererFps / containerFps * 100)
    out.pipeline = { ...pipeline, avgSendMs: r1(pipeline.sends ? pipeline.sendMsTotal / pipeline.sends : 0) }
    out.playerStats = player.stats()
    out.summary.stalls = out.playerStats.stalls
    out.summary.firstFrameMs = out.firstFrameMs
  } else {
    out.htmlState = await win.webContents.executeJavaScript('window.__htmlState()')
    const containerFps = cfg.fps
    out.summary.containerFps = containerFps
    out.summary.fpsRatio = r1(out.summary.rendererFps / containerFps * 100)
    out.summary.droppedFrames = out.htmlState.dropped
    out.summary.firstFrameMs = out.firstFrameMs
  }

  if (isMpv && cfg.extra) {
    // audio track switch
    const x = {}
    x.audioBefore = player.getProperty('audio-codec-name')
    x.aidBefore = player.getProperty('aid')
    const tBefore = Number(player.getProperty('time-pos'))
    const fBefore = (await pullRenderer()).frames
    player.setProperty('aid', '2')
    await sleep(1000)
    x.aidAfter = player.getProperty('aid')
    x.audioAfter1s = player.getProperty('audio-codec-name')
    x.currentTracksAudioCodec = player.getProperty('current-tracks/audio/codec')
    await sleep(3000)
    const tAfter = Number(player.getProperty('time-pos'))
    const fAfter = (await pullRenderer()).frames
    x.audioAfter4s = player.getProperty('audio-codec-name')
    x.timeAdvanced = r1(tAfter - tBefore)
    x.framesDuringSwitch = fAfter - fBefore
    x.pass = x.audioBefore !== x.audioAfter1s && x.audioAfter1s === x.audioAfter4s && x.timeAdvanced > 3 && x.framesDuringSwitch > 50
    out.audioSwitch = x

    // seek
    const s = {}
    const fPre = (await pullRenderer()).frames
    player.command(['seek', '30', 'absolute'])
    await sleep(1000)
    s.timePosAfter1s = Number(player.getProperty('time-pos'))
    const fMid = (await pullRenderer()).frames
    await sleep(1500)
    const fPost = (await pullRenderer()).frames
    s.timePosAfter2_5s = Number(player.getProperty('time-pos'))
    s.framesAfterSeek = fPost - fMid
    s.framesBeforeSeekCheck = fMid - fPre
    s.pass = Math.abs(s.timePosAfter1s - 30) <= 2 && s.framesAfterSeek > 30
    out.seek = s
  }
  return out
}

async function scenarioSubs() {
  const out = { shots: {} }
  const first = await waitFor(() => fx.firstFrameAt, 20000)
  out.firstFrameMs = first ? first - fx.loadAt : null
  if (!first) { out.failure = 'no first frame'; return out }
  const waitTime = async (t) => waitFor(() => Number(player.getProperty('time-pos')) >= t, 30000, 25)
  for (const [name, t] of [['t2', 2.0], ['t14', 14.0]]) {
    const ok = await waitTime(t)
    await sleep(120)
    const sh = await shot(`${cfg.submode}-${name}`)
    const o = {
      reachedTime: ok ? Number(player.getProperty('time-pos')) : null,
      file: sh.file, meanLum: r1(sh.st.meanLum),
      overlayText: await win.webContents.executeJavaScript('window.__overlayText()'),
      mpvSubText: player.getProperty('sub-text'),
      sid: player.getProperty('sid'),
      // regions of the window, assuming the 16:9 video fills the 1280x720 window
      topCensus: censusBitmap(sh.st, [0, 0, 1, 0.25]),
      bottomCensus: censusBitmap(sh.st, [0, 0.7, 1, 1]),
    }
    out.shots[name] = o
  }
  out.subTextEventCount = subTextEvents.length
  out.subTextSamples = subTextEvents.slice(0, 12)
  out.pipeline = { ...pipeline }
  return out
}

// ---------------------------------------------------------------- main run
async function run() {
  startNvidia()
  // 'basic' leaves every device active:false on Electron 41 / Windows; 'complete' flags the real one.
  let gi = await app.getGPUInfo('basic')
  if (!(gi.gpuDevice || []).some(d => d.active)) { gi = await app.getGPUInfo('complete'); R.notes.push("getGPUInfo('basic') had no active GPU; used 'complete'") }
  const devs = (gi.gpuDevice || []).map(d => ({ vendorId: d.vendorId, deviceId: d.deviceId, active: !!d.active, driverVersion: d.driverVersion }))
  const active = devs.find(d => d.active)
  R.chromiumGpu = { devices: devs, active }
  log('chromium gpu', R.chromiumGpu)
  let adapter = active ? { vendorId: active.vendorId, deviceId: active.deviceId } : undefined
  if (cfg.adapter) {
    const vendor = cfg.adapter === 'nvidia' ? 0x10de : cfg.adapter === 'intel' ? 0x8086 : parseInt(cfg.adapter, 16)
    const d = devs.find(x => x.vendorId === vendor)
    if (d) adapter = { vendorId: d.vendorId, deviceId: d.deviceId }
    R.notes.push(`adapter overridden to ${cfg.adapter}`)
  }

  win = new BrowserWindow({
    width: 1280, height: 720, show: true, useContentSize: true, backgroundColor: '#000000',
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  })
  ipcMain.handle('get-config', () => cfg)
  ipcMain.on('first-frame', (_e, at) => { fx.firstFrameAt = at })
  ipcMain.on('html-error', (_e, err) => { fx.htmlError = err })
  ipcMain.on('fps-report', (_e, r) => { fx.lastFpsReport = r })
  const ready = new Promise(res => ipcMain.once('renderer-ready', (_e, info) => res(info)))
  win.on('closed', () => { win = null })
  await win.loadFile(path.join(__dirname, 'index.html'))
  R.rendererInfo = await ready
  log('renderer ready', R.rendererInfo)

  fx.loadAt = Date.now()
  if (cfg.mode === 'mpv') {
    startPlayer(adapter)
    // Pre-set subtitle mode before loading so the first frames are already in the right mode.
    player.loadFile(cfg.file)
    // mpv does not auto-select the embedded ASS track here (no default flag / no slang), so pick it.
    await waitFor(() => fx.fileLoaded, 10000, 10)
    await applySubmode()
  }

  const res = cfg.scenario === 'subs' ? await scenarioSubs() : await scenarioMetrics()
  if (cfg.mode === 'mpv') {
    res.mpvLogTail = mpvLogs.slice(-20)
    res.playerStats = player.stats()
    res.pipeline = { ...pipeline, avgSendMs: r1(pipeline.sends ? pipeline.sendMsTotal / pipeline.sends : 0) }
    res.chromiumRendererState = await win.webContents.executeJavaScript('({drawErrors: window.__state.drawErrors, lastError: window.__state.lastError, drawMsAvg: window.__state.drawMsTotal / Math.max(1, window.__state.frames), drawMsMax: window.__state.drawMsMax})')
  }
  stopNvidia()
  await finish(res)
}

let finishing = false
async function finish(res) {
  if (finishing) return
  finishing = true
  R.closeRequestedAt = Date.now()
  writeResult({ result: res, done: true })
  log('result written, closing window')
  if (win) win.close()
}

app.on('window-all-closed', async () => {
  const t0 = Date.now()
  if (player) {
    const p = player; player = null
    const timer = setTimeout(() => { log('destroy hung; hard exit'); app.exit(3) }, 2500)
    try { await p.destroy() } catch (e) { log('destroy error', String(e)) }
    clearTimeout(timer)
    log('player destroyed in', Date.now() - t0, 'ms')
  }
  stopNvidia()
  app.quit()
})

app.whenReady().then(async () => {
  try {
    if (cfg.mode === 'probe') await probe(); else await run()
  } catch (e) {
    log('run failed', String(e && e.stack || e))
    R.errors.push(String(e && e.stack || e))
    try { writeResult({ crashed: true }) } catch {}
    app.exit(2)
  }
})
