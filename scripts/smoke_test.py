#!/usr/bin/env python
import pathlib, sys, threading, time, urllib.request, json

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
PORT = 8090

problems = []

def check(condition, msg):
    if not condition:
        problems.append(msg)

def start_server():
    import os, http.server, socketserver
    os.chdir(str(PUBLIC))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(1)
    return httpd

base = f'http://127.0.0.1:{PORT}'

def get(path):
    try:
        url = f'{base}{path}'
        with urllib.request.urlopen(url, timeout=20) as resp:
            return resp.status, resp.read()
    except Exception as e:
        return None, str(e)

httpd = start_server()

status, body = get('/index.html')
check(status == 200, f'/index.html HTTP {status} ({body})')
if status == 200:
    text = body.decode('utf-8', 'replace')
    check('<title>echo.us — prism mode</title>' in text, 'index.html title mismatch')
    check('type="module"' in text, 'index.html missing module script')
    check("import { run } from './js/main.js'" in text, 'index.html missing main.js import')
    check('three.min.js' in text, 'index.html missing three.js')
    check('FontLoader.js' not in text and 'TextGeometry.js' not in text, 'index.html must not reference broken examples/js/ loader scripts')

status, body = get('/js/identity.js')
check(status == 200, f'/js/identity.js HTTP {status} ({body})')
if status == 200:
    id_text = body.decode('utf-8', 'replace')
    check('helvetiker_bold.typeface.json' in id_text, 'typeface JSON URL not referenced in identity.js')

status, body = get('/manifest.json')
check(status == 200, f'/manifest.json HTTP {status} ({body})')
if status == 200:
    manifest = json.loads(body.decode('utf-8', 'replace'))
    check(manifest.get('name') == 'echo.us — prism mode', 'manifest name mismatch')
    check(manifest.get('display') == 'standalone', 'manifest display not standalone')
    check('icons' in manifest, 'manifest missing icons')

for path in [
    '/js/main.js',
    '/js/shell.js',
    '/js/camera_pipeline.js',
    '/js/identity.js',
    '/js/presets.js',
    '/js/audio.js',
    '/js/modes/index.js',
    '/js/modes/prism.js',
    '/js/modes/fracture.js',
    '/js/modes/void.js',
]:
    status, body = get(path)
    check(status == 200, f'{path} HTTP {status} ({body})')
    if status == 200:
        check(len(body) > 50, f'{path} suspiciously small')

for icon_path in ['icons/icon-192.png', 'icons/icon-512.png']:
    fp = PUBLIC / icon_path
    check(fp.exists(), f'{icon_path} missing')
    if fp.exists():
        try:
            from PIL import Image
            im = Image.open(fp)
            im.load()
            check(im.size[0] == im.size[1], f'{icon_path} not square {im.size}')
        except Exception as e:
            problems.append(f'{icon_path} load error: {e}')

try:
    httpd.shutdown()
except Exception:
    pass

if problems:
    print('SMOKE TEST FAIL')
    for p in problems:
        print(' - ' + p)
    sys.exit(1)

print('SMOKE TEST PASS')
sys.exit(0)
