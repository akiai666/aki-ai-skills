import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import type {Motion} from '../template/src/kit/motion.ts';

type Point = {x: number; y: number};
type Geometry = {width: number; height: number; anchor: Point; hands: {left: Point; right: Point}; bodyHeight?: number};
type Pose = Geometry & {src: string};
type Character = Geometry & {libraryVersion?: string; faces: Record<string, string>; poses?: Record<string, Pose>; actions?: Record<string, Motion>};
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values, positionals} = parseArgs({allowPositionals: true, options: {
  'ip-dir': {type: 'string'}, format: {type: 'string', default: 'h'},
  'node-modules': {type: 'string'}, help: {type: 'boolean'},
  'allow-draft-actions': {type: 'boolean'},
  'set-library': {type: 'string'}, actions: {type: 'string'}, poses: {type: 'string'}, faces: {type: 'string'},
}});

if (values.help) {
  console.log('node scripts/new-project.ts --set-library <asset directory>\nnode scripts/new-project.ts <project> [--ip-dir <asset directory>] [--actions wave,think|all|none] [--poses hold|all|none] [--faces idle,happy|all] [--format h|v] [--node-modules <directory>] [--allow-draft-actions]');
  process.exit(0);
}
const config = process.env.AKI_REMOTION_CONFIG || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'aki-remotion-explainer/config.json');
if (values['set-library']) {
  if (positionals.length) throw new Error('--set-library does not take a project path.');
  const library = fs.realpathSync(path.resolve(values['set-library']));
  if (!fs.existsSync(path.join(library, 'character.json'))) throw new Error('The library must contain character.json.');
  fs.mkdirSync(path.dirname(config), {recursive: true});
  fs.writeFileSync(config, JSON.stringify({library}, null, 2) + '\n', {mode: 0o600});
  console.log('Default library configured locally.');
  process.exit(0);
}
if (positionals.length !== 1) throw new Error('A new project path is required.');
const configured = !values['ip-dir'] && fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, 'utf8')).library : undefined;
const ipDir = values['ip-dir'] || configured;
if (typeof ipDir !== 'string' || !ipDir) throw new Error('Use --set-library once, or provide --ip-dir.');
if (!['h', 'v'].includes(values.format)) throw new Error('--format must be h or v.');
const root = path.resolve(positionals[0]), ip = path.resolve(ipDir);
if (fs.existsSync(path.join(root, 'video'))) throw new Error('video/ already exists; refusing to overwrite.');
if (fs.existsSync(path.join(root, 'plan.json'))) throw new Error('plan.json already exists; use a new project directory.');
const manifest = path.join(ip, 'character.json');
const source = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) as Character : null;
const legacy = Boolean(values['ip-dir']) && values.actions === undefined && values.poses === undefined && values.faces === undefined;
const select = <T,>(items: Record<string, T>, requested: string | undefined, fallback: string, kind: string): Record<string, T> => {
  const value = requested ?? fallback;
  if (value === 'all') return items;
  if (value === 'none') return {};
  const names = [...new Set(value.split(',').map(n => n.trim()))];
  for (const name of names) if (!Object.hasOwn(items, name)) throw new Error(`Unknown ${kind}: ${name}`);
  return Object.fromEntries(names.map(name => [name, items[name]]));
};
const geometryKeys = ['width', 'height', 'anchor', 'hands', 'bodyHeight', 'contactSupported', 'annotationStatus'];
const pick = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => keys.includes(key)));
const neutral = ['idle.png', '透明全身.png'].find(n => fs.existsSync(path.join(ip, n)));
if (!source && !neutral) throw new Error('Provide character.json or a transparent idle.png / 透明全身.png.');
let faces: Record<string, string> = source?.faces ?? {idle: neutral!};
if (!faces.idle) throw new Error('The character must include an idle expression.');
if (!source) for (const name of ['doubt', 'surprise', 'happy']) {
  if (fs.existsSync(path.join(ip, `${name}.png`))) faces[name] = `${name}.png`;
}
faces = select(faces, values.faces, legacy ? 'all' : 'idle', 'face');
if (!faces.idle) throw new Error('Selected faces must include idle.');
let size: {width: number; height: number} | undefined;
const readAsset = (file: string, label: string) => {
  const src = fs.realpathSync(path.resolve(ip, file));
  if (!src.startsWith(fs.realpathSync(ip) + path.sep)) throw new Error('Character files must be inside --ip-dir.');
  const b = fs.readFileSync(src);
  if (b.length < 26 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || b[25] !== 6) throw new Error(`${label} must be an RGBA PNG.`);
  return {src, width: b.readUInt32BE(16), height: b.readUInt32BE(20)};
};
const validateGeometry = (item: Geometry, actual: {width: number; height: number}) => {
  if (item.width !== actual.width || item.height !== actual.height) throw new Error('Manifest size does not match the PNG files.');
  if (item.bodyHeight !== undefined && (!Number.isFinite(item.bodyHeight) || item.bodyHeight <= 0 || item.bodyHeight > item.height)) throw new Error('Invalid character bodyHeight.');
  for (const p of [item.anchor, item.hands?.left, item.hands?.right]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > item.width || p.y > item.height) throw new Error('Invalid character anchor or hand point.');
  }
};
const assets = Object.entries(faces).map(([name, file]) => {
  if (!['idle', 'doubt', 'surprise', 'happy'].includes(name)) throw new Error(`Unsupported expression: ${name}`);
  const {src, ...current} = readAsset(file, name);
  if (size && (size.width !== current.width || size.height !== current.height)) throw new Error('All expressions must share dimensions and registration.');
  size = current;
  return {name, src};
});
const {width, height} = size!;
const character: Character = source ? {...pick(source, [...geometryKeys, 'libraryVersion']), faces: {}} as Character : {
  width, height, anchor: {x: width / 2, y: height},
  hands: {left: {x: width * .25, y: height * .6}, right: {x: width * .7, y: height * .6}}, faces: {},
};
validateGeometry(character, {width, height});
const poses = Object.entries(select(source?.poses ?? {}, values.poses, legacy ? 'all' : 'none', 'pose')).map(([name, pose]) => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid pose name: ${name}`);
  const asset = readAsset(pose.src, name);
  validateGeometry(pose, asset);
  return {name, pose: pick(pose, [...geometryKeys, 'src', 'label', 'category', 'scenarios']) as Pose, src: asset.src};
});
const actions = Object.entries(select(source?.actions ?? {}, values.actions, legacy ? 'all' : 'none', 'action')).map(([name, action]) => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid action name: ${name}`);
  if (!values['allow-draft-actions'] && action.status && action.status !== 'approved') throw new Error(`Action has not passed visual review: ${name}. Use --allow-draft-actions only for a review project.`);
  if (!values['allow-draft-actions'] && action.annotationStatus && action.annotationStatus !== 'reviewed') throw new Error(`Action hand and foot annotations are not reviewed: ${name}`);
  if (!Number.isFinite(action.fps) || action.fps <= 0 || action.fps > 60 || !Array.isArray(action.frames) || !action.frames.length) throw new Error(`Invalid action timing: ${name}`);
  const frames = action.frames.map((frame, i) => {
    const asset = readAsset(frame.src, `${name}/${i}`);
    if (!frame.hands) throw new Error(`Missing frame hand points: ${name}/${i}`);
    validateGeometry({...action, ...frame}, asset);
    if (frame.feet) for (const p of [frame.feet.left, frame.feet.right]) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > action.width || p.y < 0 || p.y > action.height) throw new Error(`Invalid frame foot point: ${name}/${i}`);
    }
    return {...pick(frame, ['hands', 'feet', 'anchor', 'annotationStatus']), src: asset.src};
  });
  const loop = action.loop;
  if (loop && (!Number.isInteger(loop.start) || !Number.isInteger(loop.end) || loop.start < 0 || loop.end <= loop.start || loop.end > frames.length)) throw new Error(`Invalid action loop: ${name}`);
  let previous = -1;
  const held = new Map<string, string>();
  for (const event of action.events ?? []) {
    if (!Number.isInteger(event.frame) || event.frame < previous || event.frame < 0 || event.frame >= frames.length || !['contact', 'release'].includes(event.type) || !['left', 'right'].includes(event.hand) || typeof event.prop !== 'string' || !event.prop.trim()) throw new Error(`Invalid action event: ${name}`);
    previous = event.frame;
    if (event.type === 'contact') {
      if (held.has(event.prop)) throw new Error(`Duplicate prop contact: ${name}`);
      held.set(event.prop, event.hand);
    } else {
      if (held.get(event.prop) !== event.hand) throw new Error(`Release without matching contact: ${name}`);
      held.delete(event.prop);
    }
  }
  return {name, action: pick(action, [...geometryKeys, 'fps', 'loop', 'events', 'status', 'label', 'category', 'scenarios', 'sourceType', 'sourceSha256', 'sourceFpsPolicy', 'visualReview']) as Motion, frames};
});
const nm = values['node-modules'] ? path.resolve(values['node-modules']) : null;
if (nm && !fs.existsSync(nm)) throw new Error('--node-modules does not exist.');
const video = path.join(root, 'video');
const files: Record<string, string> = {};
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const copy = (src: string, relative: string) => {
  const dest = path.join(video, 'public', relative);
  fs.copyFileSync(src, dest);
  files[relative] = sha(fs.readFileSync(dest));
};
fs.mkdirSync(root, {recursive: true});
fs.cpSync(path.join(skill, 'template'), video, {recursive: true, filter: src => !['node_modules', 'review', 'out', '.DS_Store'].includes(path.basename(src))});
const first = actions[0] ? ` action="${actions[0].name}" actionSince={0}` : poses[0] ? ` pose="${poses[0].name}"` : '';
if (first) {
  const scene = path.join(video, 'src/scenes/S01.tsx');
  fs.writeFileSync(scene, fs.readFileSync(scene, 'utf8').replace('<AkiCharacter ', `<AkiCharacter${first} `));
}
for (const name of ['input', 'voice', 'asr', 'review']) fs.mkdirSync(path.join(root, name), {recursive: true});
fs.mkdirSync(path.join(video, 'public/characters'), {recursive: true});
character.faces = {};
for (const {name, src} of assets) {
  copy(src, `characters/${name}.png`);
  character.faces[name] = `characters/${name}.png`;
}
if (poses.length) character.poses = {};
for (const {name, pose, src} of poses) {
  copy(src, `characters/pose-${name}.png`);
  character.poses![name] = {...pose, src: `characters/pose-${name}.png`};
}
if (actions.length) character.actions = {};
for (const {name, action, frames} of actions) {
  const dest = path.join(video, 'public/characters/actions', name);
  fs.mkdirSync(dest, {recursive: true});
  character.actions![name] = {...action, frames: frames.map((frame, i) => {
    const file = `${String(i).padStart(4, '0')}.png`;
    copy(frame.src, `characters/actions/${name}/${file}`);
    return {...frame, src: `characters/actions/${name}/${file}`};
  })} as Motion;
}
fs.writeFileSync(path.join(video, 'src/data/character.json'), JSON.stringify(character, null, 2) + '\n');
const characterSha256 = sha(fs.readFileSync(path.join(video, 'src/data/character.json')));
const snapshot = {schemaVersion: 1, libraryVersion: source?.libraryVersion ?? 'unversioned', characterSha256, faces: assets.map(a => a.name), poses: poses.map(p => p.name), actions: actions.map(a => a.name), files};
fs.writeFileSync(path.join(root, 'asset-snapshot.json'), JSON.stringify({...snapshot, snapshotSha256: sha(JSON.stringify(snapshot))}, null, 2) + '\n');
const demo = '让角色把关系演出来';
const plan = {schemaVersion: 2, title: 'Aki-IP-preview', format: values.format, fps: 30, duration: 6, column: 'AKI / AI EXPLAINED', keywords: [], audio: {narration: null, words: 'voice/words.json', captions: 'voice/captions.json', music: null}, presenter: null, segments: [{id: 's01', type: 'broll', start: 0, end: 6, tag: '', narration: demo, intent: '确认角色导入', visual: '无声角色预览', cues: [{say: '角色', action: '显示导入角色'}], assets: []}]};
fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'voice/words.json'), JSON.stringify({end: 6, words: [...demo].map((w, i) => ({w, s: i * .4, e: i * .4 + .35})), timingSource: 'synthetic silent preview only'}) + '\n');
fs.writeFileSync(path.join(root, 'voice/captions.json'), JSON.stringify({captions: []}) + '\n');
for (const name of ['LICENSE', 'ASSETS-LICENSE.md', 'THIRD-PARTY-NOTICES.md']) fs.copyFileSync(path.join(skill, name), path.join(root, name));
fs.cpSync(path.join(skill, 'licenses'), path.join(root, 'licenses'), {recursive: true});
if (nm) fs.symlinkSync(nm, path.join(video, 'node_modules'), 'dir');
console.log(`Created ${root}; ${assets.length} expressions, ${poses.length} poses and ${actions.length} actions imported. The initial timeline is a silent preview, not speech alignment.`);
if (values['allow-draft-actions']) console.log('REVIEW PROJECT: draft actions were imported without promoting their status. Do not treat this output as approved production assets.');
