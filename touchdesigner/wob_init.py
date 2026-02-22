import socket
import os
import subprocess
import sys

def get_local_ip():
	try:
		s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		s.connect(('8.8.8.8', 80))
		ip = s.getsockname()[0]
		s.close()
		return ip
	except Exception as e:
		print(f'[WOB] Failed to detect IP: {e}')
		return '127.0.0.1'

def _pip_install(package):
	"""Install a pip package into TD's Python environment (silent, no window)."""
	try:
		subprocess.check_call(
			[sys.executable, '-m', 'pip', 'install', '--quiet', package],
			creationflags=subprocess.CREATE_NO_WINDOW
		)
		print(f'[WOB] pip install {package} OK')
		return True
	except Exception as e:
		print(f'[WOB] pip install {package} failed: {e}')
		return False

SENSOR_COLS = [
	'slot', 'connected',
	'ax', 'ay', 'az',
	'ga', 'gb', 'gg',
	'oa', 'ob', 'og',
	'lat', 'lon',
	'touch_count',
	'trig',
]
MAX_CLIENTS = 20

def _init_tables():
	t = op('sensor_table')
	if t is not None:
		t.clear()
		t.appendRow(SENSOR_COLS)
		# No pre-populated rows — rows are added on connect, removed on disconnect
		print(f'[WOB] sensor_table initialized (dynamic rows, max {MAX_CLIENTS} slots)')
	else:
		print('[WOB] sensor_table DAT not found - create a Table DAT named "sensor_table"')

	tt = op('touch_table')
	if tt is not None:
		tt.clear()
		tt.appendRow(['slot', 'touch_id', 'x', 'y', 'state'])
		print('[WOB] touch_table initialized')
	else:
		print('[WOB] touch_table DAT not found - create a Table DAT named "touch_table"')

def onStart():
	print('[WOB] onStart triggered')
	_init_tables()
	generate()

def generate():
	print('[WOB] generate() start')

	# 1. Ensure qrcode is installed, then import
	try:
		import qrcode
	except ImportError:
		print('[WOB] qrcode not found — installing...')
		if not _pip_install('qrcode[pil]'):
			print('[WOB] qrcode install failed. Run manually: pip install "qrcode[pil]"')
			return
		import qrcode
	print('[WOB] qrcode import OK')

	# 2. Ensure pycloudflared is installed, then start tunnel
	url = None
	try:
		try:
			from pycloudflared import try_cloudflare
		except ImportError:
			print('[WOB] pycloudflared not found — installing...')
			if not _pip_install('pycloudflared'):
				print('[WOB] pycloudflared install failed — falling back to local HTTPS')
				raise RuntimeError('install failed')
			from pycloudflared import try_cloudflare

		print('[WOB] Starting cloudflare tunnel... (no signup required)')
		result = try_cloudflare(port=9980)
		url = result.url  # e.g. "https://xxxx.trycloudflare.com"
		print(f'[WOB] Cloudflare URL: {url}')

	except Exception as e:
		print(f'[WOB] Cloudflare tunnel failed: {e} — falling back to local HTTPS')

	if url is None:
		ip = get_local_ip()
		url = f'https://{ip}:9980'
		print(f'[WOB] Local URL: {url}')

	op('/').store('wob_url', url)  # Store URL internally for callbacks.py

	# Build QR URL: point directly to GitHub Pages with ?td= param
	host = url.replace('https://', '').replace('http://', '').strip()
	GITHUB_PAGES_URL = 'https://studio-edul.github.io/Web-Osc-Bridge/'
	qr_url = GITHUB_PAGES_URL + '?td=' + host
	op('wob_url_text').par.text = qr_url
	print(f'[WOB] QR URL: {qr_url}')

	# 3. Generate QR code
	try:
		qr = qrcode.QRCode(box_size=10, border=4)
		qr.add_data(qr_url)
		qr.make(fit=True)
		img = qr.make_image(fill_color='black', back_color='white')
		print('[WOB] QR image generated')
	except Exception as e:
		print(f'[WOB] QR generation failed: {e}')
		return

	# 4. Save to file
	try:
		save_path = os.path.join(project.folder, 'qr.png')
		print(f'[WOB] Save path: {save_path}')
		img.save(save_path)
		print(f'[WOB] File saved: {os.path.exists(save_path)}')
	except Exception as e:
		print(f'[WOB] File save failed: {e}')
		return

	# 5. Reload Movie File In TOP
	try:
		movie_top = op('qr_movie_top')
		if movie_top is None:
			print('[WOB] qr_movie_top not found - check node name')
			return
		print(f'[WOB] qr_movie_top found: {movie_top}')
		movie_top.par.file = save_path
		movie_top.par.reloadpulse.pulse()
		print('[WOB] TOP reloaded')
	except Exception as e:
		print(f'[WOB] TOP reload failed: {e}')
		return

	print('[WOB] generate() done')
