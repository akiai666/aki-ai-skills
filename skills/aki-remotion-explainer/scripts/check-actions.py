import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat


parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--out', type=Path)
args = parser.parse_args()
root = args.directory.resolve()
manifest = json.loads((root / 'character.json').read_text())
report = {'ok': True, 'actions': {}, 'visualReview': 'required; not established by automatic checks'}
for name, action in manifest.get('actions', {}).items():
    errors, warnings, hashes, sizes, boxes, deltas = [], [], [], [], [], []
    previous = None
    for i, frame in enumerate(action['frames']):
        try:
            path = (root / frame['src']).resolve()
            if not path.is_relative_to(root):
                raise ValueError('path escapes asset directory')
            with Image.open(path) as image:
                image.load()
                if image.mode != 'RGBA':
                    raise ValueError('not RGBA')
                if image.size != (action['width'], action['height']):
                    raise ValueError('canvas mismatch')
                alpha = image.getchannel('A')
                if alpha.getextrema()[0] != 0 or alpha.getextrema()[1] < 200:
                    raise ValueError('missing transparent background or solid character')
                boxes.append(alpha.point(lambda a: 255 if a > 128 else 0).getbbox())
                sizes.append(image.size)
                hashes.append(hashlib.sha256(image.tobytes()).hexdigest())
                thumb = Image.new('RGBA', image.size, '#e8eef6')
                thumb.alpha_composite(image)
                thumb = thumb.convert('RGB').resize((128, 192))
                if previous is not None:
                    deltas.append(round(sum(ImageStat.Stat(ImageChops.difference(previous, thumb)).mean) / 3, 3))
                previous = thumb
        except Exception as error:
            errors.append(f'frame {i}: {error}')
    count = len(action['frames'])
    fps = action.get('fps', 0)
    if not isinstance(fps, (int, float)) or fps <= 0 or fps > 60:
        errors.append('invalid source fps')
    if not count:
        errors.append('empty sequence')
    if len(set(hashes)) < len(hashes):
        warnings.append('duplicate drawings; inspect holds and do not claim them as new motion')
    if not all(f.get('feet') for f in action['frames']):
        warnings.append('per-frame foot points missing')
    loop = action.get('loop')
    if loop and not (0 <= loop['start'] < loop['end'] <= count):
        errors.append('invalid loop boundary')
    report['actions'][name] = {'count': count, 'fps': fps, 'seconds': count / fps if fps else None, 'uniqueDrawings': len(set(hashes)), 'errors': errors, 'warnings': warnings, 'alphaBounds': boxes, 'adjacentMeanDifference': deltas}
    report['ok'] = report['ok'] and not errors
if not report['actions']:
    report['ok'] = False
    report['error'] = 'no actions to check'
content = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
if args.out:
    args.out.write_text(content)
print(content)
raise SystemExit(0 if report['ok'] else 1)
