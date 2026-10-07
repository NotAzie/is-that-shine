#!/usr/bin/env python3
import pathlib, sys, json

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'

problems = []

def check(condition, msg):
    if not condition:
        problems.append(msg)

check(PUBLIC.exists(), 'public/ directory missing')
check((PUBLIC / 'index.html').exists(), 'public/index.html missing')
check((PUBLIC / 'manifest.json').exists(), 'public/manifest.json missing')
check((PUBLIC / 'icons').is_dir(), 'public/icons/ directory missing')
check((PUBLIC / 'js').is_dir(), 'public/js/ directory missing')

index = (PUBLIC / 'index.html').read_text(encoding='utf-8')
check('<title>echo.us' in index and 'prism mode</title>' in index, 'index.html title mismatch')
check('type="module"' in index, 'index.html missing module script')
check("import { run } from './js/main.js'" in index, 'index.html missing main.js import')
check('three.min.js' in index, 'index.html missing three.js CDN')
check('FontLoader.js' not in index and 'TextGeometry.js' not in index, 'index.html must not reference broken examples/js/ loader scripts')

identity = (PUBLIC / 'js' / 'identity.js').read_text(encoding='utf-8')
check('helvetiker_bold.typeface.json' in identity, 'typeface JSON URL not referenced in identity.js')

main = (PUBLIC / 'js' / 'main.js').read_text(encoding='utf-8')
check('export function run' in main, 'main.js missing run export')
check('createShell' in main, 'main.js missing createShell')
check('createCameraPipeline' in main, 'main.js missing createCameraPipeline')
check('createModes' in main, 'main.js missing createModes')
check('createIdentity' in main, 'main.js missing createIdentity')
check('createPresets' in main, 'main.js missing createPresets')
check('createAudio' in main, 'main.js missing createAudio')

shell = (PUBLIC / 'js' / 'shell.js').read_text(encoding='utf-8')
check('function createShell' in shell, 'shell.js missing createShell')
check('requestAnimationFrame' in shell, 'shell.js missing RAF loop')
check(('addEventListener(\'resize\'' in shell) or ('addEventListener("resize"' in shell), 'shell.js missing resize handling')

camera = (PUBLIC / 'js' / 'camera_pipeline.js').read_text(encoding='utf-8')
check('function createCameraPipeline' in camera, 'camera_pipeline.js missing factory')
check('navigator.mediaDevices' in camera or 'mediaDevices' in camera, 'camera_pipeline.js missing mediaDevices path')
check('getImageData' in camera, 'camera_pipeline.js missing sample/brightness path')

modes_dir = PUBLIC / 'js' / 'modes'
check(modes_dir.is_dir(), 'public/js/modes/ missing')
for name in ['prism.js', 'fracture.js', 'void.js', 'index.js', 'shared_shader.js']:
    check((modes_dir / name).exists(), f'modes/{name} missing')
    if (modes_dir / name).exists():
        content = (modes_dir / name).read_text(encoding='utf-8')
        check('export function' in content or 'export const' in content or 'export {' in content, f'modes/{name} looks non-module')

shared = (modes_dir / 'shared_shader.js').read_text(encoding='utf-8')
check('SHARED_FRAG' in shared, 'shared shader missing SHARED_FRAG')
check('createSharedPrismState' in shared, 'shared shader missing createSharedPrismState')

for name in ['prism.js', 'fracture.js', 'void.js']:
    content = (modes_dir / name).read_text(encoding='utf-8')
    check('createSharedPrismState' in content, f'{name} should use shared shader')
    body_after_import = content.split('import', 1)[-1] if 'import' in content else content
    check('precision mediump float' not in body_after_import, f'{name} should not own shader body')

check('function createIdentity' in identity, 'identity.js missing factory')
check('tick' in identity or 'renderWordmark' in identity, 'identity.js missing render tick/wordmark')

presets = (PUBLIC / 'js' / 'presets.js').read_text(encoding='utf-8')
check('function createPresets' in presets, 'presets.js missing factory')
check('localStorage' in presets, 'presets.js missing persistence')

audio = (PUBLIC / 'js' / 'audio.js').read_text(encoding='utf-8')
check('function createAudio' in audio, 'audio.js missing factory')
check('AudioContext' in audio or 'webkitAudioContext' in audio, 'audio.js missing audio context path')
check('chime' in audio, 'audio.js missing chime')

manifest = json.loads((PUBLIC / 'manifest.json').read_text(encoding='utf-8'))
check(manifest.get('name') == 'echo.us — prism mode', 'manifest name mismatch')
check(manifest.get('display') == 'standalone', 'manifest display not standalone')
check('icons' in manifest, 'manifest missing icons')

icon = PUBLIC / 'icons' / 'icon-192.png'
check(icon.exists(), 'icons/icon-192.png missing')

if problems:
    print('VERIFY FAIL')
    for p in problems:
        print(' - ' + p)
    sys.exit(1)

print('VERIFY PASS')
sys.exit(0)
