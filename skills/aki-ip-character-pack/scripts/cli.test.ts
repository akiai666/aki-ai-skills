import { afterAll, expect, test } from 'bun:test'
import sharp from 'sharp'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, checkLinks, composite, inspect, inside, prepare, styles, views, type Manifest } from './cli.ts'

const temp = await mkdtemp(join(tmpdir(), 'character-pack-tests-'))
afterAll(async () => { await rm(temp, { recursive: true, force: true }) })
const save = (p: string, v: unknown) => writeFile(p, JSON.stringify(v))
async function run(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
  const [code, error] = await Promise.all([p.exited, new Response(p.stderr).text()])
  if (code) throw Error(error)
}
async function fixture(out: string) {
  const m: Manifest = { name: '测试 <script> & $&', version: 'v1', model: 'gpt-image-2', route: 'synthetic-test-fixture', assumptions: ['这些色块用于程序测试，不是生成人物。'], history: [], styles: {} }
  for (const style of styles) {
    await mkdir(join(out, style, 'single'), { recursive: true })
    await mkdir(join(out, style, 'prompts'), { recursive: true })
    m.styles[style] = []
    for (const [i, [id]] of views.entries()) {
      const file = `${style}/single/${id}.png`, prompt = `${style}/prompts/${id}.txt`
      await sharp({ create: { width: 1024, height: id.includes('full-') ? 1536 : 1024, channels: 3, background: { r: 20 + i * 25, g: 30, b: style === 'realistic' ? 60 : 180 } } }).png().toFile(join(out, file))
      await writeFile(join(out, prompt), 'Synthetic fixture; no generation call was made.')
      m.styles[style].push({ id, file, prompt, references: ['fixture-ref'], method: 'generated', review: 'passed', issues: [] })
    }
  }
  await save(join(out, 'manifest.json'), m)
  return m
}

test('mixed input corrects EXIF, preserves source, samples at most 36 timestamped video frames', async () => {
  const src = join(temp, '输入 文件'); await mkdir(src)
  const jpg = join(src, 'portrait.jpg'), video = join(src, 'clip.mp4')
  await sharp({ create: { width: 60, height: 30, channels: 3, background: '#ab2233' } }).withMetadata({ orientation: 6 }).jpeg().toFile(jpg)
  const before = await readFile(jpg)
  await run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=2:duration=40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
  const out = join(temp, 'mixed'), result = await prepare(out, [src, jpg], '参考')
  expect(result.sources).toBe(2); expect(result.candidates).toBe(37)
  const data = JSON.parse(await readFile(join(out, 'sources.json'), 'utf8'))
  const photo = data.candidates.find((c: { timestamp: number | null }) => c.timestamp === null)
  const meta = await sharp(join(out, photo.file)).metadata()
  expect([meta.width, meta.height]).toEqual([30, 60]); expect(await readFile(jpg)).toEqual(before)
  const frames = data.candidates.filter((c: { timestamp: number | null }) => c.timestamp !== null)
  expect(frames).toHaveLength(36)
  expect(frames[0].timestamp).toBeGreaterThan(0); expect(frames.at(-1).timestamp).toBeLessThan(40)
  expect(await readFile(join(out, frames[0].file))).not.toEqual(await readFile(join(out, frames.at(-1).file)))
  await expect(prepare(out, [jpg], '重复')).rejects.toThrow('已存在')
  await expect(prepare(join(temp, 'too-many'), [jpg], '超额', 37)).rejects.toThrow('1–36')
}, 60000)

test('complete gallery preserves all originals, montage order and offline ZIP links', async () => {
  const out = join(temp, 'complete'), m = await fixture(out)
  const original = await readFile(join(out, m.styles.realistic[0].file))
  await build(out)
  expect((await inspect(out)).issues).toEqual([])
  expect(await readFile(join(out, m.styles.realistic[0].file))).toEqual(original)
  const html = await readFile(join(out, 'index.html'), 'utf8')
  expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('$&')
  const master = await sharp(join(out, 'realistic/master.png')).raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < 8; i++) {
    const offset = ((Math.floor(i / 4) * 576 + 288) * master.info.width + i % 4 * 384 + 192) * master.info.channels
    expect(master.data[offset]).toBe(20 + i * 25)
  }
  const unpack = join(temp, 'unpacked'); await mkdir(unpack)
  await run(['unzip', '-q', join(out, 'character-pack.zip'), '-d', unpack]); await checkLinks(unpack)
  expect((await readFile(join(unpack, 'index.html'), 'utf8'))).not.toContain('href="character-pack.zip"')
}, 30000)

test('low resolution and missing views cannot pass; draft remains honest with fixed empty slots', async () => {
  const out = join(temp, 'draft'), m = await fixture(out)
  await rm(join(out, m.styles.realistic[2].file))
  const small = await sharp(join(out, m.styles.cartoon[0].file)).resize(128, 128).png().toBuffer()
  await writeFile(join(out, m.styles.cartoon[0].file), small)
  await expect(build(out)).rejects.toThrow('检查未通过')
  expect((await build(out, true)).status).toBe('needs-review')
  await checkLinks(out)
  const master = await sharp(join(out, 'realistic/master.png')).raw().toBuffer({ resolveWithObject: true })
  const px = (i: number) => master.data[(288 * master.info.width + i * 384 + 192) * master.info.channels]
  expect(px(2)).toBe(240); expect(px(3)).toBe(95)
}, 30000)

test('history stays local and does not create broken links in ZIP', async () => {
  const out = join(temp, 'history-new'), old = join(temp, 'history-old'); await mkdir(old)
  await writeFile(join(old, 'index.html'), '<html>Old</html>')
  const m = await fixture(out); m.history = [{ label: '旧版', path: '../history-old/index.html' }]
  await save(join(out, 'manifest.json'), m); await build(out)
  expect(await readFile(join(old, 'index.html'), 'utf8')).toBe('<html>Old</html>')
  expect(await readFile(join(out, 'index.html'), 'utf8')).toContain('../history-old/index.html')
  const unpack = join(temp, 'unpacked-history'); await mkdir(unpack)
  await run(['unzip', '-q', join(out, 'character-pack.zip'), '-d', unpack]); await checkLinks(unpack)
  expect(await readFile(join(unpack, 'index.html'), 'utf8')).not.toContain('history-old')
}, 30000)

test('face-only composite preserves exact outside pixels, source and refuses alpha masks or overwrite', async () => {
  const dir = join(temp, 'edit'); await mkdir(dir)
  const source = join(dir, 'source.png'), candidate = join(dir, 'candidate.png'), mask = join(dir, 'weight.png'), out = join(dir, 'result.png')
  await sharp({ create: { width: 6, height: 4, channels: 3, background: '#123456' } }).png().toFile(source)
  await sharp({ create: { width: 6, height: 4, channels: 3, background: '#abcdef' } }).png().toFile(candidate)
  const weights = Buffer.alloc(24); weights[8] = 255; weights[9] = 128
  await sharp(weights, { raw: { width: 6, height: 4, channels: 1 } }).png().toFile(mask)
  const before = await readFile(source), report = await composite(source, candidate, mask, out)
  expect(report.outsideChangedPixels).toBe(0); expect(report.sourceUnchanged).toBe(true)
  expect(await readFile(source)).toEqual(before)
  const pixels = await sharp(out).raw().toBuffer()
  expect(pixels[8 * 3]).toBe(171); expect(pixels[9 * 3]).toBe(95); expect(pixels[0]).toBe(18)
  await expect(composite(source, candidate, mask, out)).rejects.toThrow('已存在')
  const alpha = join(dir, 'api-mask.png'); await sharp(mask).ensureAlpha().png().toFile(alpha)
  await expect(composite(source, candidate, alpha, join(dir, 'invalid.png'))).rejects.toThrow('透明通道')
  const mismatched = join(dir, 'mismatched.png'); await sharp(candidate).resize(3, 2).png().toFile(mismatched)
  await expect(composite(source, mismatched, mask, join(dir, 'bad-size.png'))).rejects.toThrow('尺寸必须一致')
})

test('rejects escaping assets and duplicate view file assignments', async () => {
  expect(() => inside(temp, '../outside')).toThrow('超出输出目录')
  const out = join(temp, 'invalid'), m = await fixture(out)
  m.styles.realistic[1].file = m.styles.realistic[0].file
  await save(join(out, 'manifest.json'), m)
  expect((await inspect(out)).issues.some(x => x.includes('重复使用'))).toBe(true)
}, 20000)


test('video display rotation is respected when extracting frames', async () => {
  const raw = join(temp, 'landscape.mp4'), rotated = join(temp, 'rotated.mp4')
  await run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=5:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', raw])
  await run(['ffmpeg', '-v', 'error', '-display_rotation', '90', '-i', raw, '-c', 'copy', rotated])
  const out = join(temp, 'video-rotation'); await prepare(out, [rotated], '旋转视频')
  const sources = JSON.parse(await readFile(join(out, 'sources.json'), 'utf8'))
  const image = await sharp(join(out, sources.candidates[0].file)).metadata()
  expect([image.width, image.height]).toEqual([48, 64])
}, 20000)
