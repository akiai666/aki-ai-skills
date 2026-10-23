import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const pack = path.join(root, '素材');
const character = JSON.parse(fs.readFileSync(path.join(pack, 'character.json'), 'utf8'));
const file = (relative: string) => {
  const target = fs.realpathSync(path.resolve(pack, relative));
  if (!target.startsWith(fs.realpathSync(pack) + path.sep)) throw new Error('Asset must stay inside 素材/.');
  return path.relative(root, target).split(path.sep).join('/');
};
const names = [...new Set([...Object.keys(character.poses ?? {}), ...Object.keys(character.actions ?? {})])];
const rows = names.map((name, i) => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid action name: ${name}`);
  const p = character.poses?.[name], a = character.actions?.[name];
  const pose = file(p?.src ?? a.frames[0].src);
  const frames = a?.frames.map((f: {src: string}) => file(f.src));
  const preview = a?.preview ? file(a.preview) : undefined;
  const alpha = a?.alphaVideo ? file(a.alphaVideo) : undefined;
  if (frames && (!preview || !alpha)) throw new Error(`Missing preview or alpha video: ${name}`);
  return {id: p?.id ?? a?.id ?? i + 1, name, label: p?.label ?? a?.label ?? name, group: p?.group ?? a?.group ?? '', category: p?.category ?? a?.category ?? '讲解', scenarios: p?.scenarios ?? a?.scenarios ?? [], pose, thumb: `素材/thumbs/${name}.png`, preview, alpha, poster: a?.representative ? file(a.representative) : pose, frames, fps: a?.fps, seconds: a ? a.frames.length / a.fps : undefined};
}).sort((a, b) => a.id - b.id);
fs.mkdirSync(path.join(pack, 'thumbs'), {recursive: true});
for (const row of rows) execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(root, row.pose), '-vf', 'scale=320:320:force_original_aspect_ratio=decrease', '-frames:v', '1', path.join(root, row.thumb)], {stdio: 'pipe'});
const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/gallery.html');
const html = fs.readFileSync(template, 'utf8').replace('__COUNTS__', `${Object.keys(character.poses ?? {}).length} 张透明姿势 · ${Object.keys(character.actions ?? {}).length} 段连续动作`).replace('__CATALOG__', JSON.stringify(rows).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Refreshed gallery: ${rows.length} entries.`);
