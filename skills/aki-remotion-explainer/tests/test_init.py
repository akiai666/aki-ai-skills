import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import zlib
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/new-project.ts'


def png(path, width=2, height=4, alpha=True):
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    rgba = b'\x70\x80\x90\xff' if alpha else b'\x70\x80\x90'
    payload = b'\x89PNG\r\n\x1a\n'
    payload += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6 if alpha else 2, 0, 0, 0))
    payload += chunk(b'IDAT', zlib.compress((b'\0' + rgba * width) * height))
    payload += chunk(b'IEND', b'')
    path.write_bytes(payload)


class ImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.ip = self.root / 'ip'
        self.ip.mkdir()
        png(self.ip / 'idle.png')

    def tearDown(self):
        self.tmp.cleanup()

    def invoke(self, *args):
        return subprocess.run(['node', '--experimental-strip-types', str(SCRIPT), str(self.root / 'project'), '--ip-dir', str(self.ip), *args], capture_output=True, text=True)

    def test_import_and_no_overwrite(self):
        result = self.invoke('--format', 'v')
        self.assertEqual(result.returncode, 0, result.stderr)
        video = self.root / 'project/video'
        imported = video / 'public/characters/idle.png'
        self.assertEqual(imported.read_bytes(), (self.ip / 'idle.png').read_bytes())
        meta = json.loads((video / 'src/data/character.json').read_text())
        self.assertEqual(meta['faces'], {'idle': 'characters/idle.png'})
        self.assertNotIn(str(self.ip), json.dumps(meta))
        original = hashlib.sha256(imported.read_bytes()).hexdigest()
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertEqual(hashlib.sha256(imported.read_bytes()).hexdigest(), original)

    def test_bad_expression_size_leaves_no_project(self):
        png(self.ip / 'happy.png', width=3)
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse((self.root / 'project').exists())

    def test_opaque_input_rejected(self):
        png(self.ip / 'idle.png', alpha=False)
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse((self.root / 'project').exists())

    def test_outside_asset_rejected(self):
        png(self.root / 'outside.png')
        (self.ip / 'character.json').write_text(json.dumps({'faces': {'idle': '../outside.png'}}))
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse((self.root / 'project').exists())

    def manifest(self):
        return {'width': 2, 'height': 4, 'anchor': {'x': 1, 'y': 4}, 'hands': {'left': {'x': 0, 'y': 2}, 'right': {'x': 2, 'y': 2}}, 'faces': {'idle': 'idle.png'}}

    def test_pose_import_keeps_own_geometry(self):
        png(self.ip / 'hold.png', width=6, height=8)
        data = self.manifest()
        pose = {'src': 'hold.png', 'width': 6, 'height': 8, 'bodyHeight': 7, 'anchor': {'x': 2, 'y': 8}, 'hands': {'left': {'x': 1, 'y': 5}, 'right': {'x': 5, 'y': 4}}}
        data['poses'] = {'hold': pose}
        (self.ip / 'character.json').write_text(json.dumps(data))
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        video = self.root / 'project/video'
        imported = json.loads((video / 'src/data/character.json').read_text())
        self.assertEqual(imported['poses']['hold'], {**pose, 'src': 'characters/pose-hold.png'})
        self.assertEqual((video / 'public/characters/pose-hold.png').read_bytes(), (self.ip / 'hold.png').read_bytes())

    def test_bad_pose_anchor_leaves_no_project(self):
        data = self.manifest()
        data['poses'] = {'hold': {**data, 'src': 'idle.png', 'anchor': {'x': 99, 'y': 4}}}
        (self.ip / 'character.json').write_text(json.dumps(data))
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse((self.root / 'project').exists())

    def test_symlink_outside_asset_rejected(self):
        png(self.root / 'outside.png')
        (self.ip / 'hold.png').symlink_to(self.root / 'outside.png')
        data = self.manifest()
        data['poses'] = {'hold': {**data, 'src': 'hold.png'}}
        (self.ip / 'character.json').write_text(json.dumps(data))
        self.assertNotEqual(self.invoke().returncode, 0)
        self.assertFalse((self.root / 'project').exists())

    def action_manifest(self):
        data = self.manifest()
        data['actions'] = {'push': {**self.manifest(), 'fps': 12, 'frames': [
            {'src': 'idle.png', 'hands': data['hands']} for _ in range(24)
        ], 'events': [{'frame': 4, 'type': 'contact', 'hand': 'right', 'prop': 'card'}, {'frame': 12, 'type': 'release', 'hand': 'right', 'prop': 'card'}]}}
        return data

    def test_action_import_and_frame_paths(self):
        data = self.action_manifest()
        (self.ip / 'character.json').write_text(json.dumps(data))
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        video = self.root / 'project/video'
        meta = json.loads((video / 'src/data/character.json').read_text())
        action = meta['actions']['push']
        self.assertEqual(len(action['frames']), 24)
        self.assertEqual(action['fps'], 12)
        self.assertEqual(action['events'], data['actions']['push']['events'])
        self.assertEqual(action['frames'][-1]['src'], 'characters/actions/push/0023.png')
        self.assertTrue((video / 'public' / action['frames'][-1]['src']).is_file())
        self.assertIn('action="push" actionSince={0}', (video / 'src/scenes/S01.tsx').read_text())

    def test_invalid_sequences_leave_no_project(self):
        changes = [
            lambda a: a.update(status='pilot-not-approved'),
            lambda a: a.update(annotationStatus='pending-manual-review'),
            lambda a: a.update(fps=0),
            lambda a: a.update(frames=[]),
            lambda a: a.update(loop={'start': 5, 'end': 25}),
            lambda a: a['frames'][0].update(src='missing.png'),
            lambda a: a['frames'][0].update(hands={'left': {'x': 99, 'y': 2}, 'right': {'x': 1, 'y': 2}}),
            lambda a: a.update(events=[{'frame': 24, 'type': 'contact', 'hand': 'right', 'prop': 'card'}]),
            lambda a: a.update(events=[{'frame': 1, 'type': 'release', 'hand': 'right', 'prop': 'card'}]),
            lambda a: a['frames'][0].update(feet={'left': {'x': 99, 'y': 4}, 'right': {'x': 1, 'y': 4}}),
        ]
        for change in changes:
            with self.subTest(change=change):
                data = self.action_manifest()
                change(data['actions']['push'])
                (self.ip / 'character.json').write_text(json.dumps(data))
                self.assertNotEqual(self.invoke().returncode, 0)
                self.assertFalse((self.root / 'project').exists())

    def test_action_rejects_mixed_canvases_and_escape(self):
        png(self.ip / 'large.png', width=6, height=8)
        png(self.root / 'outside.png')
        (self.ip / 'linked.png').symlink_to(self.root / 'outside.png')
        for src in ['large.png', '../outside.png', 'linked.png']:
            data = self.action_manifest()
            data['actions']['push']['frames'][0]['src'] = src
            (self.ip / 'character.json').write_text(json.dumps(data))
            self.assertNotEqual(self.invoke().returncode, 0)
            self.assertFalse((self.root / 'project').exists())

    def test_explicit_review_import_preserves_draft_status(self):
        data = self.action_manifest()
        data['actions']['push'].update(status='pilot-not-approved', annotationStatus='pending-manual-review')
        (self.ip / 'character.json').write_text(json.dumps(data))
        result = self.invoke('--allow-draft-actions')
        self.assertEqual(result.returncode, 0, result.stderr)
        meta = json.loads((self.root / 'project/video/src/data/character.json').read_text())
        self.assertEqual(meta['actions']['push']['status'], 'pilot-not-approved')
        self.assertIn('REVIEW PROJECT', result.stdout)

    def test_selection_ignores_unused_assets_and_unknown_names_fail(self):
        data = self.action_manifest()
        data['poses'] = {'unused': {'src': 'missing.png'}}
        data['actions']['unused'] = {'frames': []}
        data['privatePath'] = str(self.ip)
        (self.ip / 'character.json').write_text(json.dumps(data))
        result = self.invoke('--actions', 'typo')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'project').exists())
        result = self.invoke('--actions', 'push')
        self.assertEqual(result.returncode, 0, result.stderr)
        video = self.root / 'project/video'
        meta = json.loads((video / 'src/data/character.json').read_text())
        self.assertEqual(list(meta['actions']), ['push'])
        self.assertFalse(meta.get('poses'))
        self.assertEqual(len(list((video / 'public/characters').rglob('*.png'))), 25)
        self.assertNotIn(str(self.ip), json.dumps(meta))

    def test_local_default_override_and_snapshot_isolation(self):
        data = self.action_manifest()
        data['libraryVersion'] = 'v1'
        (self.ip / 'character.json').write_text(json.dumps(data))
        config = self.root / 'config/settings.json'
        env = {**os.environ, 'AKI_REMOTION_CONFIG': str(config)}
        def run(*args):
            return subprocess.run(['node', '--experimental-strip-types', str(SCRIPT), *map(str, args)], env=env, capture_output=True, text=True)
        result = run('--set-library', self.ip)
        self.assertEqual(result.returncode, 0, result.stderr)
        first = self.root / 'first'
        result = run(first, '--actions', 'push')
        self.assertEqual(result.returncode, 0, result.stderr)
        snap = json.loads((first / 'asset-snapshot.json').read_text())
        image = first / 'video/public/characters/idle.png'
        original = image.read_bytes()
        self.assertEqual(snap['libraryVersion'], 'v1')
        self.assertEqual(snap['files']['characters/idle.png'], hashlib.sha256(original).hexdigest())
        self.assertNotIn(str(self.ip), json.dumps(snap))
        changed = original + b'updated'
        (self.ip / 'idle.png').write_bytes(changed)
        second = self.root / 'second'
        result = run(second, '--actions', 'push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(image.read_bytes(), original)
        self.assertEqual((second / 'video/public/characters/idle.png').read_bytes(), changed)
        self.assertNotEqual(snap['snapshotSha256'], json.loads((second / 'asset-snapshot.json').read_text())['snapshotSha256'])
        default = self.root / 'default'
        self.assertEqual(run(default).returncode, 0)
        self.assertEqual(len(list((default / 'video/public/characters').rglob('*.png'))), 1)
        other = self.root / 'other'
        other.mkdir()
        png(other / 'idle.png', width=3)
        override = self.root / 'override'
        result = run(override, '--ip-dir', other)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((override / 'video/src/data/character.json').read_text())['width'], 3)

    def test_export_contains_only_selected_assets_and_explicit_documents(self):
        data = self.action_manifest()
        (self.ip / 'character.json').write_text(json.dumps(data))
        (self.ip / 'private-voice.wav').write_bytes(b'private')
        (self.ip / 'private-log.json').write_text('{"private":true}')
        license = self.root / 'license.md'
        license.write_text('Test fixture license')
        prompt = self.root / 'prompt.txt'
        prompt.write_text('One action, fixed camera.')
        output = self.root / 'release.zip'
        cmd = ['node', str(SCRIPT.with_name('export-pack.ts')), '--ip-dir', str(self.ip), '--version', 'v1', '--output', str(output), '--actions', 'push', '--license', str(license), '--prompt', str(prompt)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(output) as archive:
            names = archive.namelist()
            self.assertFalse(any('voice' in n or 'log.json' in n or 'node_modules' in n for n in names))
            meta = json.loads(archive.read('aki-motion-v1/character.json'))
            self.assertEqual(meta['libraryVersion'], 'v1')
            self.assertEqual(list(meta['actions']), ['push'])
            self.assertEqual(len([n for n in names if n.endswith('.png')]), 25)
            self.assertIn('aki-motion-v1/prompts/01-prompt.txt', names)
            self.assertNotIn(str(self.ip), archive.read('aki-motion-v1/source-snapshot.json').decode())
            hashes = json.loads(archive.read('aki-motion-v1/pack-manifest.json'))
            for file, digest in hashes['files'].items():
                self.assertEqual(hashlib.sha256(archive.read('aki-motion-v1/' + file)).hexdigest(), digest)
            extracted = self.root / 'unpacked'
            archive.extractall(extracted)
        imported = self.root / 'from-release'
        result = subprocess.run(['node', str(SCRIPT), str(imported), '--ip-dir', str(extracted / 'aki-motion-v1'), '--actions', 'push'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((imported / 'video/public/characters/actions/push/0000.png').read_bytes(), (self.ip / 'idle.png').read_bytes())


if __name__ == '__main__':
    unittest.main()
