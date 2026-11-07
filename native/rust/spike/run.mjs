// Automation: builds the addon, runs every scenario in its own Electron process, writes
//   <S>\spike-logs\results.json  and  native\rust\spike\RESULTS.md
// Usage (PowerShell): node run.mjs [--skip-build] [--only=<label-substring>]
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rustDir = path.resolve(here, '..')
// Work folder holding libmpv\ and media\ (see README.md); logs and screenshots go to spike-logs\.
const S = process.env.SPIKE_S
if (!S) {
  console.error('Set SPIKE_S to the spike work folder (see README.md).')
  process.exit(2)
}
const LOGS = path.join(S, 'spike-logs')
fs.mkdirSync(path.join(LOGS, 'shots'), { recursive: true })
const electron = path.resolve(rustDir, '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe')
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7)
const TIMEOUT_MS = 90_000
const MARKER = '<!-- manual notes below this line are preserved across runs -->'

const FILES = {
  hard: { file: 'hard1080-hevc10-dts-ac3-ass.mkv', fps: 23.976, desc: '1080p 23.976 HEVC 10-bit, DTS+AC3, ASS' },
  hi10: { file: 'hi10p1080-h264-10bit-ac3-ass.mkv', fps: 23.976, desc: '1080p 23.976 H.264 High10, AC3, ASS' },
  uhd: { file: 'uhd60-hevc10-eac3.mkv', fps: 60, desc: '2160p 60 HEVC 10-bit, E-AC3' },
  base: { file: 'baseline1080-h264-aac.mp4', fps: 23.976, desc: '1080p 23.976 H.264 8-bit, AAC' },
}

// ------------------------------------------------------------------ build (A1)
const results = { startedAt: new Date().toISOString(), runs: {}, build: null }
if (!skipBuild) {
  const t0 = Date.now()
  const b = spawnSync('cargo', ['build', '--release'], { cwd: rustDir, shell: true, encoding: 'utf8' })
  results.build = { ok: b.status === 0, seconds: (Date.now() - t0) / 1000, tail: (b.stderr || '').split('\n').slice(-6).join('\n') }
  if (b.status !== 0) { console.error(b.stderr); process.exit(1) }
}
fs.copyFileSync(path.join(rustDir, 'target', 'release', 'miteiru_node.dll'), path.join(here, 'miteiru_node.node'))
if (!results.build) results.build = { ok: true, skipped: true }

// ------------------------------------------------------------------ run helper
function leftoverProcesses() {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match 'spike-profile|rust.spike' } | ForEach-Object { $_.ProcessId }`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  return (r.stdout || '').split(/\s+/).filter(Boolean)
}

async function runOne(label, o) {
  if (only && !label.includes(only)) return null
  const out = path.join(LOGS, `${label}.json`)
  for (const f of [out]) try { fs.unlinkSync(f) } catch {}
  const env = {
    ...process.env,
    SPIKE_S: S,
    SPIKE_AUTO: '1',
    SPIKE_OUT: out,
    SPIKE_LABEL: label,
    SPIKE_MODE: o.mode || 'mpv',
    SPIKE_SUBMODE: o.sub || 'overlay',
    SPIKE_SCENARIO: o.scenario || 'metrics',
    SPIKE_EXTRA: o.extra ? '1' : '0',
    SPIKE_FILE: path.join(S, 'media', o.file.file),
    SPIKE_FPS: String(o.file.fps),
    SPIKE_SYNC: o.sync || 'query',
    SPIKE_DRAW: o.draw || '2d',
    SPIKE_ADAPTER: o.adapter || '',
    SPIKE_DURATION: String(o.duration || 20),
  }
  console.log(`== ${label} ...`)
  const t0 = Date.now()
  const child = spawn(electron, [here], { env, stdio: 'ignore' })
  const rec = { label, opts: o }
  let exited = null
  const exit = new Promise(res => child.on('exit', (code, sig) => { exited = { code, sig, at: Date.now() }; res() }))
  const timer = setTimeout(() => {
    rec.timedOut = true
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
  }, TIMEOUT_MS)
  await exit
  clearTimeout(timer)
  rec.wallSeconds = (Date.now() - t0) / 1000
  rec.exitCode = exited.code
  let json = null
  try { json = JSON.parse(fs.readFileSync(out, 'utf8')) } catch {}
  rec.json = json
  if (json && json.closeRequestedAt) rec.shutdownMs = exited.at - json.closeRequestedAt
  rec.leftover = leftoverProcesses()
  if (rec.leftover.length) spawnSync('taskkill', ['/F', '/T', ...rec.leftover.flatMap(p => ['/PID', p])])
  results.runs[label] = rec
  console.log(`   exit=${rec.exitCode} shutdown=${rec.shutdownMs}ms wall=${rec.wallSeconds.toFixed(1)}s leftover=${rec.leftover.length}${rec.timedOut ? ' TIMEOUT' : ''}`)
  return rec
}

// ------------------------------------------------------------------ scenarios
await runOne('m-hard', { file: FILES.hard, extra: true })
await runOne('m-hi10', { file: FILES.hi10 })
await runOne('m-uhd', { file: FILES.uhd })
await runOne('m-base', { file: FILES.base })
for (const sub of ['libass', 'overlay', 'hybrid']) await runOne(`s-${sub}`, { file: FILES.hard, scenario: 'subs', sub })
await runOne('h-base', { file: FILES.base, mode: 'html' })
await runOne('h-hard', { file: FILES.hard, mode: 'html', duration: 10 })
// variants: other draw path, other sync variant, mismatched adapter
await runOne('x-uhd-webgpu', { file: FILES.uhd, draw: 'webgpu' })
await runOne('x-base-keyedmutex', { file: FILES.base, sync: 'keyedmutex' })
await runOne('x-uhd-keyedmutex', { file: FILES.uhd, sync: 'keyedmutex' })
await runOne('x-base-intel', { file: FILES.base, adapter: 'intel', duration: 10 })

fs.writeFileSync(path.join(LOGS, 'results.json'), JSON.stringify(results, null, 2))
fs.writeFileSync(path.join(here, 'RESULTS.md'), renderMarkdown(results))
console.log('wrote results.json and RESULTS.md')

// ------------------------------------------------------------------ report
function fmt(x, d = 1) { return x == null || Number.isNaN(x) ? 'n/a' : (typeof x === 'number' ? Number(x.toFixed(d)).toString() : String(x)) }

function rowFor(rec) {
  const j = rec.json, r = j && j.result, s = r && r.summary
  if (!s) return null
  const m = s.mpv
  const lastTime = m ? Number(m['time-pos']) : null
  const dropped = s.droppedFrames
  const dropPct = m && lastTime ? dropped / (s.containerFps * lastTime) * 100 : null
  return {
    res: m ? `${m.dwidth}x${m.dheight}@${fmt(s.containerFps, 3)}` : `${(r.htmlState || {}).videoWidth}x${(r.htmlState || {}).videoHeight}@${fmt(s.containerFps, 3)}`,
    hwdec: m ? m['hwdec-current'] : 'n/a (Chromium)',
    codecs: m ? `${m['video-codec'].split(' ')[0]} / ${m['audio-codec-name']}` : 'n/a',
    fps: `${fmt(s.rendererFps)} (${fmt(s.fpsRatio)}%)`,
    drops: dropped == null ? 'n/a' : `${dropped} (${fmt(dropPct, 2)}%)`,
    stalls: s.stalls ?? 'n/a',
    cpu: `${fmt(s.cpu.browser)} / ${fmt(s.cpu.gpu)} / ${fmt(s.cpu.renderer)}`,
    ram: `${fmt(s.ramMB.browser, 0)} / ${fmt(s.ramMB.gpu, 0)} / ${fmt(s.ramMB.renderer, 0)}`,
    nv: `${fmt(s.nvGpuPct)} / ${fmt(s.nvDecoderPct)}`,
    ff: fmt(s.firstFrameMs, 0),
    dropPct, fpsRatio: s.fpsRatio,
  }
}

function renderMarkdown(R) {
  const L = []
  const run = k => R.runs[k]
  const any = Object.values(R.runs).find(r => r.json)
  const J = any && any.json
  L.push('# libmpv zero-copy spike: results', '')
  L.push(`Generated by run.mjs at ${R.startedAt}. Throwaway spike; nodeIntegration is ON and contextIsolation is OFF in the harness window (spike only, never do this in the app).`, '')
  if (J) {
    L.push('## Environment', '')
    L.push(`- Chromium active GPU: ${JSON.stringify(J.chromiumGpu.active)} (all devices: ${J.chromiumGpu.devices.map(d => `0x${d.vendorId.toString(16)}:0x${d.deviceId.toString(16)}`).join(', ')})`)
    L.push(`- mpv D3D11 device adapter: ${J.adapterInfo || 'n/a'}`)
    L.push(`- Render path for every number below: **zero-copy** (D3D11 shared NT-handle texture -> sharedTexture.importSharedTexture -> sendSharedTexture -> VideoFrame -> canvas 2D drawImage), sync variant **query** (Flush + D3D11_QUERY_EVENT) unless the row says otherwise. The copy fallback was not built (not needed).`)
    L.push('- CPU%: Electron `percentCPUUsage` from `app.getAppMetrics()` = CPU time of the process since the previous call, as a percentage of ONE logical core (can exceed 100 for multi-threaded processes); sampled once per second, averaged over the 20 s window. RAM = `memory.workingSetSize`, averaged.')
    L.push('- NVIDIA columns come from `nvidia-smi -l 1` (`utilization.gpu` / `utilization.decoder`), averaged over the same window. Audio: mpv runs with `mute=yes` (audio still decodes and drives A/V sync).', '')
  }

  L.push('## Per-file results (mpv, overlay mode, 20 s window from first frame)', '')
  L.push('| file | resolution@fps | hwdec | video / audio codec | renderer fps (% of source) | drops (frame+decoder, % of played) | stalls | CPU% browser / GPU / renderer | RAM MB browser / GPU / renderer | NVIDIA gpu% / decoder% | first frame ms |')
  L.push('|---|---|---|---|---|---|---|---|---|---|---|')
  const tableKeys = [['m-hard', FILES.hard], ['m-hi10', FILES.hi10], ['m-uhd', FILES.uhd], ['m-base', FILES.base]]
  for (const [k, f] of tableKeys) {
    const rec = run(k); const row = rec && rowFor(rec)
    if (!row) { L.push(`| ${f.file} | FAILED (${rec ? (rec.timedOut ? 'timeout' : `exit ${rec.exitCode}`) : 'not run'}) | | | | | | | | | |`); continue }
    L.push(`| ${f.file} | ${row.res} | ${row.hwdec} | ${row.codecs} | ${row.fps} | ${row.drops} | ${row.stalls} | ${row.cpu} | ${row.ram} | ${row.nv} | ${row.ff} |`)
  }
  L.push('')
  L.push('## Variants and html mode', '')
  L.push('| run | what | resolution@fps | hwdec | renderer fps (% of source) | drops | stalls | CPU% b / g / r | RAM MB b / g / r | NVIDIA gpu% / dec% | first frame ms | notes |')
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
  const variants = [
    ['x-uhd-webgpu', '4K60, WebGPU importExternalTexture draw'],
    ['x-base-keyedmutex', 'baseline, SHARED_KEYEDMUTEX sync'],
    ['x-uhd-keyedmutex', '4K60, SHARED_KEYEDMUTEX sync'],
    ['x-base-intel', 'baseline, mpv device forced onto the Intel iGPU (mismatch)'],
    ['h-base', 'html <video>, baseline (no mpv)'],
    ['h-hard', 'html <video>, hard1080 (no mpv)'],
  ]
  for (const [k, what] of variants) {
    const rec = run(k)
    if (!rec) { L.push(`| ${k} | ${what} | not run | | | | | | | | | |`); continue }
    const row = rowFor(rec)
    const r = rec.json && rec.json.result
    let note = ''
    if (r && r.failure) note += r.failure + '; '
    if (r && r.htmlError) note += 'html error ' + JSON.stringify(r.htmlError) + '; '
    if (r && r.htmlState && r.htmlState.error) note += 'video.error ' + JSON.stringify(r.htmlState.error) + '; '
    if (r && r.pipeline && (r.pipeline.importErrors || r.pipeline.sendErrors || r.pipeline.timeouts)) note += `importErrors=${r.pipeline.importErrors} sendErrors=${r.pipeline.sendErrors} timeouts=${r.pipeline.timeouts} ${JSON.stringify(r.pipeline.firstErrors)}; `
    if (rec.json && rec.json.adapterInfo) note += `adapter: ${rec.json.adapterInfo}; `
    if (!row) { L.push(`| ${k} | ${what} | no metrics | | | | | | | | | ${note || 'no result'} |`); continue }
    L.push(`| ${k} | ${what} | ${row.res} | ${row.hwdec} | ${row.fps} | ${row.drops} | ${row.stalls} | ${row.cpu} | ${row.ram} | ${row.nv} | ${row.ff} | ${note} |`)
  }
  L.push('')

  // --------------- acceptance
  L.push('## Acceptance criteria', '')
  const pf = (ok) => ok ? 'PASS' : 'FAIL'
  const crit = []
  crit.push(['A1', R.build.ok && Object.values(R.runs).some(r => r.json && r.json.result && r.json.result.playerStats), `cargo build --release ${R.build.skipped ? '(skipped in this invocation)' : `ok in ${fmt(R.build.seconds, 0)} s`}; addon loads and plays in Electron 41`])
  const a2 = tableKeys.map(([k]) => {
    const rec = run(k); const row = rec && rowFor(rec); const r = rec && rec.json && rec.json.result
    if (!row) return `${k}: no data`
    const ok = row.fpsRatio >= 90 && row.dropPct != null && row.dropPct <= 1 && r.shots && r.shots.differ && r.shots.notBlack && rec.exitCode === 0 && !rec.json.crashed
    return `${k}: ${pf(ok)} (fps ${fmt(row.fpsRatio)}%, drops ${fmt(row.dropPct, 2)}%, shots differ=${r.shots && r.shots.differ} notBlack=${r.shots && r.shots.notBlack})`
  })
  crit.push(['A2', a2.every(x => x.includes(': PASS')), a2.join('; ')])
  crit.push(['A3', tableKeys.every(([k]) => { const row = run(k) && rowFor(run(k)); return row && row.hwdec }), tableKeys.map(([k, f]) => { const row = run(k) && rowFor(run(k)); return `${f.file}: ${row ? row.hwdec : 'n/a'}` }).join('; ')])
  const hr = run('m-hard') && run('m-hard').json && run('m-hard').json.result
  crit.push(['A4', hr && hr.audioSwitch && hr.audioSwitch.pass, hr && hr.audioSwitch ? JSON.stringify(hr.audioSwitch) : 'no data'])
  crit.push(['A5', hr && hr.seek && hr.seek.pass, hr && hr.seek ? JSON.stringify(hr.seek) + ' (pass = |time-pos - 30| <= 2 s after 1 s, frames continue)' : 'no data'])
  const sl = run('s-libass') && run('s-libass').json && run('s-libass').json.result
  const so = run('s-overlay') && run('s-overlay').json && run('s-overlay').json.result
  const sh = run('s-hybrid') && run('s-hybrid').json && run('s-hybrid').json.result
  const a6auto = so && so.shots.t2.overlayText === '今日はいい天気ですね。' && sh && sh.shots.t2.overlayText === '今日はいい天気ですね。' && sh.shots.t14.mpvSubText === '看板：喫茶店' && !!sh.shots.t14.overlayText
  crit.push(['A6', a6auto, `automated part: overlay@2s text=${JSON.stringify(so && so.shots.t2.overlayText)}; hybrid@2s text=${JSON.stringify(sh && sh.shots.t2.overlayText)}; hybrid@14s overlay=${JSON.stringify(sh && sh.shots.t14.overlayText)}, mpv visible track text=${JSON.stringify(sh && sh.shots.t14.mpvSubText)}; libass@14s mpv sub-text=${JSON.stringify(sl && sl.shots.t14.mpvSubText)}. Pixel placement (sign at top, dialogue at bottom, no duplicate) is checked on the screenshots, see manual notes.`])
  const ot = hr && hr.overlayTest
  crit.push(['A7', ot && !ot.skipped && ot.hitOk && ot.popupOk, ot ? JSON.stringify(ot) : 'no data'])
  const hb = run('h-base') && rowFor(run('h-base'))
  const hh = run('h-hard') && run('h-hard').json && run('h-hard').json.result
  crit.push(['A8', !!hb && !!hh, `html baseline: ${hb ? `${hb.fps} fps, drops ${hb.drops}, CPU ${hb.cpu}` : 'n/a'}; html hard1080: ${hh ? (hh.failure ? hh.failure : 'played') : 'n/a'} ${hh && hh.htmlState ? JSON.stringify(hh.htmlState) : ''}`])
  const sd = Object.values(R.runs).filter(r => r.json)
  const worst = Math.max(...sd.map(r => r.shutdownMs ?? 99999))
  crit.push(['A9', sd.every(r => r.exitCode === 0 && (r.shutdownMs ?? 99999) <= 3000 && r.leftover.length === 0), `${sd.length} runs: all exit code 0 = ${sd.every(r => r.exitCode === 0)}; worst close->exit ${worst} ms; leftover electron processes: ${sd.reduce((a, r) => a + r.leftover.length, 0)}`])
  L.push('| id | result | evidence |', '|---|---|---|')
  for (const [id, ok, ev] of crit) L.push(`| ${id} | ${pf(!!ok)} | ${String(ev).replace(/\|/g, '/')} |`)
  L.push('')

  // --------------- extra facts
  L.push('## Measured details', '')
  for (const k of ['m-hard', 'm-hi10', 'm-uhd', 'm-base']) {
    const r = run(k) && run(k).json && run(k).json.result
    if (!r || !r.summary) continue
    L.push(`- ${k}: pipeline ${JSON.stringify(r.pipeline)}; player ${JSON.stringify(r.playerStats)}; renderer draw ${JSON.stringify(r.chromiumRendererState)}; min per-second fps ${r.summary.minSecondFps}; rAF ${r.summary.rafFps} Hz; screenshots: t3 ${r.shots.t3 && r.shots.t3.pctLum}% / t6 ${r.shots.t6 && r.shots.t6.pctLum}% luminance, mean abs diff ${r.shots.meanAbsDiff}/255`)
  }
  for (const [k, r0] of Object.entries(R.runs)) {
    const r = r0.json && r0.json.result
    if (r && r.mpvLogTail && r.mpvLogTail.length) L.push(`- ${k} mpv warnings: ${JSON.stringify(r.mpvLogTail.slice(0, 5))}`)
  }
  if (sh) L.push(`- subtitle runs: sub-text events while sub-visibility=no (overlay mode): ${so ? so.subTextEventCount : 'n/a'} events, samples ${JSON.stringify(so && so.subTextSamples)}`)
  L.push('')

  let manual = ''
  try {
    const old = fs.readFileSync(path.join(here, 'RESULTS.md'), 'utf8')
    const i = old.indexOf(MARKER)
    if (i >= 0) manual = old.slice(i)
  } catch {}
  L.push(manual || `${MARKER}\n\n(notes pending)\n`)
  return L.join('\n') + '\n'
}
