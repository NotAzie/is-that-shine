#!/usr/bin/env python
import os, http.server, socketserver, threading, time

PORT = 8090
ROOT = os.path.dirname(os.path.abspath(__file__))

os.chdir(ROOT)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
time.sleep(1)
print('server up on %d' % PORT)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    httpd.shutdown()
