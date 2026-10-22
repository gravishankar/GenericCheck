#!/usr/bin/env python3
"""Build the single-file standalone version of GeneriCheck.

Output goes OUTSIDE the deploy folder (the preview validator forbids storage
APIs in deployed files). The standalone file ships a GC_STORAGE adapter that
auto-saves medicine lists on the device where the file is run.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), 'genericheck-standalone.html')

html = open(os.path.join(ROOT, 'index.html')).read()
css = open(os.path.join(ROOT, 'styles.css')).read()
data = open(os.path.join(ROOT, 'data.js')).read()
app = open(os.path.join(ROOT, 'app.js')).read()

ADAPTER = """<script>
/* Standalone storage adapter: auto-saves medicine lists in this browser.
   Silently unavailable storage falls back to in-memory + export/import. */
window.GC_STORAGE = (function () {
  try {
    var k = '__gc_t__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return {
      read: function (key) { return window.localStorage.getItem(key); },
      write: function (key, value) { window.localStorage.setItem(key, value); }
    };
  } catch (e) { return null; }
})();
</script>
"""

html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="data.js"></script>', '<script>\n' + data + '\n</script>')
html = html.replace('<script src="app.js"></script>', ADAPTER + '<script>\n' + app + '\n</script>')
assert '<script src=' not in html and 'href="styles.css"' not in html

html = html.replace(
    'The downloadable single-file version of this app saves lists automatically',
    'This file is the standalone version — medicine lists save automatically')
html = html.replace(
    'on the device where it is run.',
    'on the device where you run it. Keep this file anywhere and double-click it to open.')
html = html.replace(
    'If browser data is cleared, lists are lost — use Export to keep a backup file.',
    'If browser data is cleared, lists are lost — use Export to keep a backup file.')

open(OUT, 'w').write(html)
print('written', OUT, os.path.getsize(OUT), 'bytes')
