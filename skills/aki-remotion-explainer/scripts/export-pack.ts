import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const {values} = parseArgs({options: {
  'ip-dir': {type: 'string'}, version: {type: 'string'}, output: {type: 'string'},
  actions: {type: 'string', default: 'none'}, poses: {type: 'string', default: 'none'},
  faces: {type: 'string', default: 'idle'}, license: {type: 'string'},
  prompt: {type: 'string', multiple: true}, 'allow-draft-actions': {type: 'boolean'},
}});
if (!values.output || !values.version || !values.license) throw new Error('--output, --version and --license are required. Exports locally; never uploads.');
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values.version)) throw new Error('Invalid version.');
const output = path.resolve(values.output);
if (fs.existsSync(output)) throw new Error('Output already exists.');
const textFiles = [values.license, ...(values.prompt ?? [])].map(p => ({name: path.basename(p), text: fs.readFileSync(p, 'utf8')}));
for (const f of textFiles) if (/\/Users\/|\/home\/|file:\/\/|[A-Z]:\\Users\\/.test(f.text)) throw new Error(`Remove local paths before export: ${f.name}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-pack-'));
try {
  const project = path.join(temp, 'project'), pack = path.join(temp, `aki-motion-${values.version}`);
  const args = [path.join(path.dirname(fileURLToPath(import.meta.url)), 'new-project.ts'), project, '--actions', values.actions, '--poses', values.poses, '--faces', values.faces];
  if (values['ip-dir']) args.push('--ip-dir', values['ip-dir']);
  if (values['allow-draft-actions']) args.push('--allow-draft-actions');
  execFileSync(process.execPath, args, {stdio: 'pipe'});
  fs.mkdirSync(pack);
  fs.cpSync(path.join(project, 'video/public/characters'), path.join(pack, 'characters'), {recursive: true});
  const character = JSON.parse(fs.readFileSync(path.join(project, 'video/src/data/character.json'), 'utf8'));
  const config = process.env.AKI_REMOTION_CONFIG || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'aki-remotion-explainer/config.json');
  const ip = fs.realpathSync(values['ip-dir'] || JSON.parse(fs.readFileSync(config, 'utf8')).library);
  const source = fs.existsSync(path.join(ip, 'character.json')) ? JSON.parse(fs.readFileSync(path.join(ip, 'character.json'), 'utf8')) : {};
  for (const name of Object.keys(character.actions ?? {})) {
    for (const [key, file] of Object.entries({preview: 'preview.mp4', alphaVideo: 'alpha.webm', representative: 'representative.png'})) {
      const src = source.actions?.[name]?.[key];
      if (!src) continue;
      const target = fs.realpathSync(path.resolve(ip, src));
      if (!target.startsWith(ip + path.sep)) throw new Error('Preview files must stay inside the library.');
      const relative = `characters/actions/${name}/${file}`;
      fs.copyFileSync(target, path.join(pack, relative));
      character.actions[name][key] = relative;
    }
  }
  character.libraryVersion = values.version;
  fs.writeFileSync(path.join(pack, 'character.json'), JSON.stringify(character, null, 2) + '\n');
  fs.copyFileSync(path.join(project, 'asset-snapshot.json'), path.join(pack, 'source-snapshot.json'));
  fs.writeFileSync(path.join(pack, 'ASSETS-LICENSE.md'), textFiles[0].text);
  if (textFiles.length > 1) fs.mkdirSync(path.join(pack, 'prompts'));
  for (const [i, f] of textFiles.slice(1).entries()) fs.writeFileSync(path.join(pack, 'prompts', `${String(i + 1).padStart(2, '0')}-${f.name}`), f.text);
  const hashes: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else hashes[path.relative(pack, file).split(path.sep).join('/')] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  };
  walk(pack);
  fs.writeFileSync(path.join(pack, 'pack-manifest.json'), JSON.stringify({version: values.version, files: hashes}, null, 2) + '\n');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  execFileSync('zip', ['-qr', output, path.basename(pack)], {cwd: temp});
  console.log(`Exported ${output}. No upload performed.`);
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
