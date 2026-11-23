#!/usr/bin/env python3
"""Relocate the verified Python.org universal2 framework for private app bundling.
Input is pkgutil --expand-full's Python_Framework.pkg/Payload directory.
No installation, Resolve operation or system Python modification is performed.
"""
import argparse,os,shutil,subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('destination',type=Path);a=p.parse_args()
dest=a.destination/'Python.framework'
if dest.exists():raise SystemExit('Destination already exists; choose an empty staging directory.')
shutil.copytree(a.source,dest,symlinks=True)
version=dest/'Versions/3.14'
# Keep the complete standard library and its licences. Remove installer-only caches.
for f in list(dest.rglob('__pycache__')):
 if f.is_dir():shutil.rmtree(f)
# The host is headless; omit Tcl/Tk GUI frameworks and their unused adapter.
shutil.rmtree(version/'Frameworks',ignore_errors=True)
for f in [version/'lib/python3.14/tkinter',version/'lib/python3.14/idlelib']:
 shutil.rmtree(f,ignore_errors=True)
for f in (version/'lib/python3.14/lib-dynload').glob('_tkinter*'):f.unlink()
native=[]
magic={b'\xfe\xed\xfa\xce',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca'}
for f in dest.rglob('*'):
 if f.is_symlink() or not f.is_file():continue
 with f.open('rb') as h:is_native=h.read(4) in magic
 if not is_native:continue
 f.chmod(0o755)
 dependencies=subprocess.check_output(['otool','-L',str(f)],text=True)
 for line in dependencies.splitlines():
  old=line.strip().split(' (compatibility')[0]
  prefix='/Library/Frameworks/Python.framework/'
  if old.startswith(prefix):
   target=dest/old[len(prefix):]
   new='@loader_path/'+os.path.relpath(target,f.parent)
   subprocess.run(['install_name_tool','-change',old,new,str(f)],check=True)
 native.append(f)
for f in sorted(native,key=lambda p:len(p.parts),reverse=True):
 subprocess.run(['codesign','--force','--sign','-',str(f)],check=True)
link=a.destination/'python3';link.symlink_to('Python.framework/Versions/3.14/bin/python3.14')
subprocess.run([str(link),'-I','-c','import sys,json,socket,ctypes,uuid;print(sys.version);print(sys.prefix)'],check=True)
print(a.destination)
