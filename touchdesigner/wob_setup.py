"""
WOB Setup — run ONCE to install required packages into TD's Python.

Usage in TD (Button DAT script or Textport):
    op('wob_setup').module.install()
"""

import subprocess
import sys

PACKAGES = ['qrcode[pil]', 'pycloudflared']

def install():
	print('[WOB Setup] Starting package installation...')
	print(f'[WOB Setup] Python: {sys.executable}')
	all_ok = True
	for pkg in PACKAGES:
		print(f'[WOB Setup] Installing {pkg}...')
		try:
			subprocess.check_call(
				[sys.executable, '-m', 'pip', 'install', '--quiet', pkg],
				creationflags=subprocess.CREATE_NO_WINDOW
			)
			print(f'[WOB Setup] {pkg} OK')
		except Exception as e:
			print(f'[WOB Setup] {pkg} FAILED: {e}')
			all_ok = False
	if all_ok:
		print('[WOB Setup] All packages installed. You can now use WOB from any directory.')
	else:
		print('[WOB Setup] Some packages failed. Check the log above.')
