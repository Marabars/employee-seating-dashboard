#!/usr/bin/env python3
"""
build.py — bundle everything into a single self-contained HTML file.

Run:  python build.py
Output: employee-seating-dashboard.html  (same directory)

The result can be double-clicked on any machine with a modern browser.
No web server, no Node.js, no internet required.
"""
import re, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, 'index.html')
OUT  = os.path.join(BASE, 'employee-seating-dashboard.html')

def read(path, encoding='utf-8'):
    with open(path, encoding=encoding, errors='replace') as f:
        return f.read()

html = read(SRC)

# 1. Inline <link rel="stylesheet" href="...">
def inline_css(m):
    href = m.group(1)
    path = os.path.join(BASE, href.replace('/', os.sep))
    if not os.path.exists(path):
        print(f'  WARN: CSS not found: {href}')
        return m.group(0)
    content = read(path)
    print(f'  CSS  {href}  ({len(content):,} chars)')
    return f'<style>\n{content}\n</style>'

html = re.sub(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\'][^>]*>', inline_css, html)
html = re.sub(r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']stylesheet["\'][^>]*>', inline_css, html)

# 2. Inline <script src="...">
def inline_js(m):
    src = m.group(1)
    path = os.path.join(BASE, src.replace('/', os.sep))
    if not os.path.exists(path):
        print(f'  WARN: JS not found: {src}')
        return m.group(0)
    content = read(path)
    print(f'  JS   {src}  ({len(content):,} chars)')
    # Avoid </script> inside the inlined content breaking the tag
    content = content.replace('</script>', '<\\/script>')
    return f'<script>\n{content}\n</script>'

html = re.sub(r'<script\s+src=["\']([^"\']+)["\'](\s*type=["\'][^"\']*["\'])?\s*>', inline_js, html)

out_size = len(html.encode('utf-8'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'\nDone! -> {os.path.basename(OUT)}  ({out_size/1024/1024:.1f} MB)')
print('Share this single file — no server or extra files needed.')
