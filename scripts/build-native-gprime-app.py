#!/usr/bin/env python3
"""Build the actual Galaxy Scopez launcher/native dispatcher for local testing.
No installer, no GTap installation and no Resolve interaction. Signing is separate.
The release packager compiles these same Swift sources and grading modules.
"""
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

root=Path(__file__).resolve().parents[1]
app=Path('/private/tmp/galaxy-scopez-native-dev/Galaxy Scopez.app')
if app.exists():shutil.rmtree(app)
contents=app/'Contents';resources=contents/'Resources';host=resources/'host'
for path in [contents/'MacOS',resources/'runtime',host/'web',host/'scripts',host/'build',host/'web/node_modules']:
    path.mkdir(parents=True,exist_ok=True)
subprocess.run(['xcrun','swiftc','-swift-version','5','-O','-module-cache-path','/tmp/gs-native-control-swift-cache',
    str(root/'installer/HostApp.swift'),str(root/'installer/NativeResolveControl.swift'),'-o',str(contents/'MacOS/GalaxyScopez')],check=True)
shutil.copy2(Path(shutil.which('node')).resolve(),resources/'runtime/node')
for path in (root/'web').glob('*.mjs'):
    if not path.name.endswith('.test.mjs'):shutil.copy2(path,host/'web'/path.name)
for name in ['package.json','VERSION']:shutil.copy2(root/'web'/name,host/'web'/name)
shutil.copytree(root/'web/public',host/'web/public')
for name,files in [('ws',['package.json','LICENSE','index.js','wrapper.mjs','lib']),('nosleep.js',['package.json','LICENSE','dist/NoSleep.min.js']),('three',['package.json','LICENSE','build/three.core.js','build/three.module.js','build/three.webgpu.js','build/three.tsl.js'])]:
    source=root/'web/node_modules'/name;destination=host/'web/node_modules'/name
    for relative in files:
        src=source/relative
        if not src.exists():continue
        dst=destination/relative;dst.parent.mkdir(parents=True,exist_ok=True)
        if src.is_dir():shutil.copytree(src,dst)
        else:shutil.copy2(src,dst)
for name in ['native-grade-worker.py','gprime-grading.py','gprime-actions.py','contrast-panel-bridge.py','native-contrast-panel-test.py','grading-session.mjs']:
    shutil.copy2(root/'scripts'/name,host/'scripts'/name)
shutil.copy2(root/'build/scope-analysis.node',host/'build/scope-analysis.node')
shutil.copy2(root/'installer/AppIcon.icns',resources/'AppIcon.icns')
version=(root/'web/VERSION').read_text().strip()
info={'CFBundleIdentifier':'com.vidarandersen.ghettoscopez','CFBundleName':'Galaxy Scopez','CFBundleDisplayName':'Galaxy Scopez',
      'CFBundleExecutable':'GalaxyScopez','CFBundleIconFile':'AppIcon.icns','CFBundlePackageType':'APPL',
      'CFBundleShortVersionString':version,'CFBundleVersion':version,'LSMinimumSystemVersion':'27.0','LSUIElement':True,'NSHighResolutionCapable':True}
(contents/'Info.plist').write_bytes(plistlib.dumps(info))
subprocess.run(['/usr/bin/xattr','-cr',str(app)],check=True)
print(app)
print('Built only. Sign the runtime and app with the existing Developer ID before launch.')
