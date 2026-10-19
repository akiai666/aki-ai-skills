import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

export const views = [['01-face-closeup', '面部特写'], ['02-full-front', '全身正面'], ['03-full-side', '全身侧面'], ['04-full-back', '全身背面'], ['05-bust-front', '上半身正面'], ['06-bust-45', '上半身45°'], ['07-bust-side', '上半身90°'], ['08-bust-back', '上半身背面']] as const
export const styles = ['realistic', 'cartoon'] as const
const labels = { realistic: '写实版', cartoon: '卡通版' }
const bg = '#f0f1f2'
const root = resolve(import.meta.dir, '..')
export type View = { id: string; file: string; prompt: string; references: string[]; method: 'generated' | 'local-edit' | 'inherited' | 'crop'; review: 'pending' | 'passed' | 'needs-review'; issues: string[]; actual?: number[] }
export type Manifest = { name: string; version: string; model: string; route: string; assumptions: string[]; history: { label: string; path: string }[]; styles: Record<string, View[]>; status?: string; issues?: string[] }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const url = (s: string) => s.split('/').map(encodeURIComponent).join('/')
const exists = async (p: string) => access(p).then(() => true, () => false)
const json = async (p: string, v: unknown) => writeFile(p, JSON.stringify(v, null, 2) + '\n')
const abs = (p: string) => { if (!isAbsolute(p)) throw Error('路径必须为绝对路径: ' + p); return resolve(p) }
export function inside(base: string, p: string) {
  const full = resolve(base, p)
  if (full !== base && !full.startsWith(base + sep)) throw Error('文件超出输出目录: ' + p)
  return full
}
async function hash(p: string) {
  const h = createHash('sha256')
  for await (const b of createReadStream(p)) h.update(b)
  return h.digest('hex')
}
async function run(args: string[], cwd?: string) {
  const proc = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code) throw Error(`${args[0]} 失败: ${err.slice(-1800)}`)
  return out
}
const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.heic', '.heif', '.avif'])
const videoExt = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi'])
async function collect(p: string): Promise<string[]> {
  const st = await lstat(p)
  if (st.isSymbolicLink()) return []
  if (st.isDirectory()) {
    const all: string[] = []
    for (const n of (await readdir(p)).sort()) if (!n.startsWith('.')) all.push(...await collect(join(p, n)))
    return all
  }
  return imageExt.has(extname(p).toLowerCase()) || videoExt.has(extname(p).toLowerCase()) ? [p] : []
}
async function contact(files: { id: string; file: string }[], out: string) {
  for (let start = 0; start < files.length; start += 24) {
    const slice = files.slice(start, start + 24), layers: sharp.OverlayOptions[] = []
    for (const [i, f] of slice.entries()) {
      const im = await sharp(inside(out, f.file)).resize(240, 240, { fit: 'contain', background: bg, withoutEnlargement: true }).png().toBuffer()
      layers.push({ input: im, left: i % 4 * 240, top: Math.floor(i / 4) * 270 })
      const text = Buffer.from(`<svg width="240" height="30"><text x="8" y="21" font-size="14">${esc(f.id)}</text></svg>`)
      layers.push({ input: text, left: i % 4 * 240, top: Math.floor(i / 4) * 270 + 240 })
    }
    await sharp({ create: { width: 960, height: Math.ceil(slice.length / 4) * 270, channels: 3, background: bg } }).composite(layers).png().toFile(join(out, 'references', `contact-${start / 24 + 1}.png`))
  }
}
export async function prepare(out: string, inputs: string[], name: string, frameLimit = 36) {
  abs(out)
  if (await exists(out)) throw Error('输出目录已存在；请选择新版本目录，避免覆盖')
  if (!inputs.length || !Number.isInteger(frameLimit) || frameLimit < 1 || frameLimit > 36) throw Error('需要输入素材，frames 范围为 1–36')
  const files = [...new Set((await Promise.all(inputs.map(p => collect(abs(p))))).flat())]
  if (!files.length) throw Error('没有支持的图片或视频')
  await mkdir(join(out, 'references'), { recursive: true })
  const sources: { id: string; source: string; sha256: string; kind: string; duration?: number }[] = []
  const candidates: { id: string; sourceId: string; file: string; timestamp: number | null; selected: boolean; angle: string; notes: string }[] = []
  for (const [i, p] of files.entries()) {
    const id = `src-${String(i + 1).padStart(3, '0')}`, digest = await hash(p)
    if (imageExt.has(extname(p).toLowerCase())) {
      const file = `references/${id}.jpg`
      try { await sharp(p).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: bg }).jpeg({ quality: 94 }).toFile(join(out, file)) }
      catch (e) { throw Error(`无法读取 ${p}；请转换为 PNG/JPEG 后重试。${e}`) }
      sources.push({ id, source: p, sha256: digest, kind: 'image' })
      candidates.push({ id, sourceId: id, file, timestamp: null, selected: false, angle: 'unreviewed', notes: '' })
    } else {
      const probe = JSON.parse(await run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', p]))
      const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video')
      const duration = Number(v?.duration ?? probe.format?.duration)
      if (!v || !Number.isFinite(duration) || duration <= 0) throw Error('视频无有效画面或时长: ' + p)
      sources.push({ id, source: p, sha256: digest, kind: 'video', duration })
      const count = Math.min(frameLimit, Math.max(1, Math.ceil(duration)))
      for (let j = 0; j < count; j++) {
        const timestamp = (j + 0.5) * duration / count, fid = `${id}-f${String(j + 1).padStart(2, '0')}`, file = `references/${fid}.jpg`
        await run(['ffmpeg', '-v', 'error', '-nostdin', '-ss', String(timestamp), '-i', p, '-frames:v', '1', '-vf', "scale=w='min(2048,iw)':h='min(2048,ih)':force_original_aspect_ratio=decrease", '-q:v', '2', '-n', join(out, file)])
        if (!await exists(join(out, file))) throw Error(`视频抽帧失败: ${p} @ ${timestamp}`)
        candidates.push({ id: fid, sourceId: id, file, timestamp, selected: false, angle: 'unreviewed', notes: '' })
      }
    }
  }
  await json(join(out, 'sources.json'), { sources, candidates })
  await contact(candidates, out)
  const manifest: Manifest = { name, version: out.split(sep).at(-1)!, model: 'gpt-image-2', route: 'unrecorded', assumptions: [], history: [], styles: {} }
  for (const style of styles) {
    await mkdir(join(out, style, 'single'), { recursive: true })
    await mkdir(join(out, style, 'prompts'), { recursive: true })
    manifest.styles[style] = views.map(([id]) => ({ id, file: `${style}/single/${id}.png`, prompt: `${style}/prompts/${id}.txt`, references: [], method: 'generated', review: 'pending', issues: [] }))
  }
  await json(join(out, 'manifest.json'), manifest)
  return { sources: sources.length, candidates: candidates.length, manifest: join(out, 'manifest.json') }
}
export async function inspect(out: string) {
  const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as Manifest
  if (!m.name || !m.version || !m.styles || !Array.isArray(m.history) || !Array.isArray(m.assumptions)) throw Error('manifest 格式无效')
  const issues: string[] = []
  if (m.model !== 'gpt-image-2') issues.push('模型不是约定的 gpt-image-2')
  if (!m.route || m.route === 'unrecorded') issues.push('未记录实际生成渠道')
  const seen = new Set<string>()
  for (const style of styles) {
    const entries = m.styles[style]
    if (!Array.isArray(entries)) throw Error('缺少风格: ' + style)
    if (entries.length !== 8 || new Set(entries.map(v => v.id)).size !== 8) issues.push(`${style}: 必须恰好包含 8 种视图`)
    for (const [id] of views) {
      const v = entries.find(e => e.id === id)
      if (!v) { issues.push(`${style}/${id}: 缺少视图`); continue }
      const path = inside(out, v.file)
      if (seen.has(path)) issues.push(`${style}/${id}: 重复使用同一文件`)
      seen.add(path)
      if (!await exists(path)) { issues.push(`${style}/${id}: 图片缺失`); continue }
      const meta = await sharp(path).metadata()
      v.actual = [meta.width!, meta.height!]
      const full = id.includes('full-')
      if ((meta.width ?? 0) < 1024 || (meta.height ?? 0) < (full ? 1536 : 1024)) issues.push(`${style}/${id}: 实际尺寸 ${meta.width}×${meta.height} 低于目标`)
      if (meta.format !== 'png') issues.push(`${style}/${id}: 不是 PNG`)
      if (!['generated', 'local-edit', 'inherited'].includes(v.method)) issues.push(`${style}/${id}: 不是独立生成或保留的原图`)
      if (v.review !== 'passed') issues.push(`${style}/${id}: 未通过目视检查`)
      if (!v.references?.length) issues.push(`${style}/${id}: 未记录参考素材`)
      if (!v.prompt || !await exists(inside(out, v.prompt))) issues.push(`${style}/${id}: 提示词缺失`)
      issues.push(...(v.issues ?? []).map(s => `${style}/${id}: ${s}`))
    }
  }
  for (const h of m.history) {
    if (isAbsolute(h.path) || /[:?#]/.test(h.path)) throw Error('历史入口必须是相对文件路径')
    if (!await exists(resolve(out, h.path))) issues.push('历史入口缺失: ' + h.path)
  }
  return { manifest: m, issues }
}
async function montage(out: string, files: (string | null)[], target: string, cols: number, w: number, h: number) {
  if (!files.some(Boolean)) { await rm(target, { force: true }); return }
  const layers: sharp.OverlayOptions[] = []
  for (const [i, file] of files.entries()) {
    if (!file) continue
    const input = await sharp(inside(out, file)).flatten({ background: bg }).resize(w, h, { fit: 'contain', background: bg, withoutEnlargement: true }).png().toBuffer()
    layers.push({ input, left: i % cols * w, top: Math.floor(i / cols) * h })
  }
  await mkdir(dirname(target), { recursive: true })
  await sharp({ create: { width: cols * w, height: Math.ceil(files.length / cols) * h, channels: 3, background: bg } }).composite(layers).png().toFile(target)
}
const a = (href: string, label: string, download = false) => `<a href="${esc(url(href))}"${download ? ' download' : ''}>${esc(label)}</a>`
async function page(title: string, body: string) {
  return (await readFile(join(root, 'assets/gallery.html'), 'utf8')).replace('{{TITLE}}', () => esc(title)).replace('{{BODY}}', () => body)
}
async function render(out: string, m: Manifest, offline = false) {
  const status = m.status === 'complete' ? '' : '<p class="issue">待完善版本：部分素材尚未通过检查，请查看下方问题记录。</p>'
  const issues = m.issues?.length ? `<section><h2>待完善项目</h2><ul>${m.issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''
  const assumptions = m.assumptions.length ? `<section><h2>参考与补全说明</h2><ul>${m.assumptions.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''
  const history = (prefix: string) => offline ? '' : m.history.map(h => a(prefix + h.path, h.label)).join(' ')
  const pages: Record<string, string> = {}, tiles: string[] = []
  for (const style of styles) {
    const entries = m.styles[style], cards: string[] = []
    for (const [id, label] of views) {
      const v = entries.find(e => e.id === id)
      if (!v || !await exists(inside(out, v.file))) { cards.push(`<div class="card"><p>${esc(label)} · 暂缺</p></div>`); continue }
      const file = relative(join(out, style), inside(out, v.file)).split(sep).join('/')
      cards.push(`<div class="card"><a href="${esc(url(file))}"><img loading="lazy" src="${esc(url(file))}" alt="${esc(label)}"></a><p>${esc(label)} · ${v.actual?.join('×')}</p><p>${a(file, '下载原图', true)}</p></div>`)
    }
    const wide: string[] = []
    for (const [file, title] of [['master.png', '角色总览'], ['multiview/full-body-3views.png', '全身三视图'], ['multiview/upper-body-4views.png', '上半身四视图']]) if (await exists(join(out, style, file))) wide.push(`<section><h2>${title}</h2><a href="${url(file)}"><img class="wide" src="${url(file)}" alt="${title}"></a></section>`)
    const nav = `<nav>${a('../index.html', '两套总入口')} ${styles.filter(s => s !== style).map(s => a(`../${s}/index.html`, labels[s])).join(' ')} ${offline ? '' : a('../character-pack.zip', '下载完整素材包', true)} ${history('../')}</nav>`
    pages[`${style}/index.html`] = await page(`${m.name} · ${labels[style]}`, `<h1>${esc(m.name)} · ${labels[style]}</h1><p>${esc(m.version)}</p>${nav}${status}${wide[0] ?? ''}<section><h2>独立原图</h2><div class="grid">${cards.join('')}</div></section>${wide.slice(1).join('')}${assumptions}${issues}`)
    const preview = await exists(join(out, style, 'master.png')) ? `<img class="wide" src="${style}/master.png" alt="${labels[style]}总览">` : ''
    tiles.push(`<section><h2>${a(`${style}/index.html`, labels[style])}</h2>${preview}</section>`)
  }
  pages['index.html'] = await page(`${m.name} · 角色素材包`, `<h1>${esc(m.name)} · 角色素材包</h1><p>${esc(m.version)} · 写实与卡通双版本</p><nav>${offline ? '' : a('character-pack.zip', '下载完整素材包', true)} ${history('')}</nav>${status}<div class="grid styles">${tiles.join('')}</div>${assumptions}${issues}`)
  return pages
}
export async function build(out: string, draft = false) {
  const { manifest: m, issues } = await inspect(out)
  if (issues.length && !draft) throw Error('检查未通过；修正后重试，或用 --draft 明确交付待完善版本:\n' + issues.join('\n'))
  m.issues = issues; m.status = issues.length ? 'needs-review' : 'complete'
  for (const style of styles) {
    const entries: View[] = []
    for (const [id] of views) {
      const v = m.styles[style].find(v => v.id === id)
      if (v && await exists(inside(out, v.file))) entries.push(v)
    }
    await mkdir(join(out, style), { recursive: true })
    const slots = views.map(([id]) => entries.find(v => v.id === id)?.file ?? null)
    await montage(out, slots, join(out, style, 'master.png'), 4, 384, 576)
    await montage(out, slots.slice(1, 4), join(out, style, 'multiview/full-body-3views.png'), 3, 512, 768)
    await montage(out, slots.slice(4), join(out, style, 'multiview/upper-body-4views.png'), 4, 512, 512)
  }
  await json(join(out, 'manifest.json'), m)
  if (await exists(join(out, 'sources.json'))) {
    const sources = JSON.parse(await readFile(join(out, 'sources.json'), 'utf8'))
    await json(join(out, 'reference-list.json'), {
      sources: sources.sources.map((s: { id: string; source: string; sha256: string; kind: string; duration?: number }) => ({ id: s.id, name: s.source.split(sep).at(-1), sha256: s.sha256, kind: s.kind, duration: s.duration })),
      candidates: sources.candidates.map((c: { id: string; sourceId: string; timestamp: number | null; selected: boolean; angle: string; notes: string }) => ({ id: c.id, sourceId: c.sourceId, timestamp: c.timestamp, selected: c.selected, angle: c.angle, notes: c.notes })),
    })
  }
  for (const [file, html] of Object.entries(await render(out, m))) await writeFile(join(out, file), html)
  const stage = await mkdtemp(join(tmpdir(), 'character-pack-zip-'))
  try {
    for (const file of ['identity.md', 'reference-list.json']) if (await exists(join(out, file))) await copyFile(join(out, file), join(stage, file))
    for (const style of styles) {
      const files = ['master.png', 'multiview/full-body-3views.png', 'multiview/upper-body-4views.png'].map(f => `${style}/${f}`)
      files.push(...m.styles[style].flatMap(v => [v.file, v.prompt]).filter(Boolean))
      for (const file of new Set(files)) if (await exists(inside(out, file))) { await mkdir(dirname(inside(stage, file)), { recursive: true }); await copyFile(inside(out, file), inside(stage, file)) }
    }
    const portable = { ...m, history: [] }
    await json(join(stage, 'manifest.json'), portable)
    for (const [file, html] of Object.entries(await render(out, portable, true))) { await mkdir(dirname(join(stage, file)), { recursive: true }); await writeFile(join(stage, file), html) }
    await checkLinks(stage)
    const zip = join(stage, 'character-pack.zip')
    await run(['zip', '-q', '-r', zip, '.', '-x', 'character-pack.zip'], stage)
    await copyFile(zip, join(out, 'character-pack.zip'))
  } finally { await rm(stage, { recursive: true, force: true }) }
  await checkLinks(out)
  return { status: m.status, issues, index: join(out, 'index.html') }
}
export async function checkLinks(out: string) {
  for (const file of ['index.html', 'realistic/index.html', 'cartoon/index.html']) {
    const html = await readFile(join(out, file), 'utf8')
    for (const hit of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const link = decodeURIComponent(hit[1].replaceAll('&amp;', '&'))
      if (/^[a-z]+:/i.test(link)) throw Error('图库包含外部依赖: ' + link)
      if (!await exists(resolve(out, dirname(file), link))) throw Error(`断链 ${file}: ${link}`)
    }
  }
}
export async function composite(source: string, candidate: string, mask: string, out: string) {
  for (const p of [source, candidate, mask, out]) abs(p)
  if (await exists(out) || await exists(out + '.json')) throw Error('目标已存在，不覆盖旧版')
  if ((await sharp(mask).metadata()).hasAlpha) throw Error('本地混合需无透明通道的灰度蒙版，不能使用 API 透明蒙版')
  for (const p of [source, candidate]) if (!(await sharp(p).stats()).isOpaque) throw Error('局部合成仅支持不透明背景素材')
  const originalHash = await hash(source)
  const read = (p: string) => sharp(p).flatten({ background: bg }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  const [s, c, w] = await Promise.all([read(source), read(candidate), sharp(mask).greyscale().removeAlpha().raw().toBuffer({ resolveWithObject: true })])
  if (s.info.width !== c.info.width || s.info.height !== c.info.height || s.info.width !== w.info.width || s.info.height !== w.info.height) throw Error('图片和蒙版尺寸必须一致；先目视确认对齐，禁止盲目拉伸')
  const data = Buffer.from(s.data)
  for (let i = 0; i < w.data.length; i++) for (let j = 0; j < 3; j++) data[i * 3 + j] = Math.round(c.data[i * 3 + j] * w.data[i] / 255 + s.data[i * 3 + j] * (1 - w.data[i] / 255))
  await mkdir(dirname(out), { recursive: true })
  await sharp(data, { raw: { width: s.info.width, height: s.info.height, channels: 3 } }).png().toFile(out)
  const final = await read(out)
  let outsideChanged = 0
  for (let i = 0; i < w.data.length; i++) if (w.data[i] === 0 && [0, 1, 2].some(j => final.data[i * 3 + j] !== s.data[i * 3 + j])) outsideChanged++
  const report = { sourceSha256: originalHash, sourceUnchanged: originalHash === await hash(source), outsideChangedPixels: outsideChanged, dimensions: [s.info.width, s.info.height] }
  await json(out + '.json', report)
  if (outsideChanged || !report.sourceUnchanged) throw Error('局部编辑保护检查失败')
  return report
}
if (import.meta.main) {
  try {
    const [cmd, ...args] = process.argv.slice(2)
    const { values: v } = parseArgs({ args, options: { out: { type: 'string' }, input: { type: 'string', multiple: true }, name: { type: 'string' }, frames: { type: 'string' }, draft: { type: 'boolean' }, source: { type: 'string' }, candidate: { type: 'string' }, mask: { type: 'string' } } })
    if (!['prepare', 'build', 'verify', 'composite'].includes(cmd) || !v.out) throw Error('用法: bun scripts/cli.ts prepare|build|verify|composite --out /absolute/path；详细参数见 references/workflow.md')
    const out = abs(v.out)
    const result = cmd === 'prepare' ? await prepare(out, v.input ?? [], v.name ?? '角色', Number(v.frames ?? 36)) : cmd === 'build' ? await build(out, !!v.draft) : cmd === 'composite' ? await composite(v.source!, v.candidate!, v.mask!, out) : await inspect(out)
    if (cmd === 'verify') { await checkLinks(out); if ('issues' in result && result.issues.length) process.exitCode = 1 }
    console.log(JSON.stringify(result, null, 2))
  } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 }
}
