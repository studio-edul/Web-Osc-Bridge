import socket
import os
import subprocess
import time

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

SENSOR_COLS = [
	'slot', 'connected',
	'ax', 'ay', 'az',
	'ga', 'gb', 'gg',
	'oa', 'ob', 'og',
	'lat', 'lon',
	'touch_count',
]
MAX_CLIENTS = 5

def _init_tables():
	t = op('sensor_table')
	if t is not None:
		t.clear()
		t.appendRow(SENSOR_COLS)
		for i in range(1, MAX_CLIENTS + 1):
			row = [i, 0] + [0.0] * (len(SENSOR_COLS) - 2)
			t.appendRow(row)
		print('[WOB] sensor_table initialized')
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

	# 1. Import qrcode
	try:
		import qrcode
		print('[WOB] qrcode import OK')
	except Exception as e:
		print(f'[WOB] qrcode import failed: {e}')
		print('[WOB] Install via: "C:/Program Files/Derivative/TouchDesigner/bin/python.exe" -m pip install qrcode pillow pyngrok')
		return

	# 2. Determine URL (ngrok preferred, fallback to local HTTPS)
	url = None

	try:
		from pyngrok import ngrok, conf
		# Read authtoken directly from ngrok config file (UTF-8)
		token = None
		config_path = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'ngrok', 'ngrok.yml')
		if os.path.exists(config_path):
			with open(config_path, 'r', encoding='utf-8', errors='replace') as f:
				for line in f:
					if 'authtoken' in line:
						token = line.split(':', 1)[1].strip()
						print(f'[WOB] authtoken found: {token[:8]}...')
						break
		if not token:
			print(f'[WOB] authtoken not found in: {config_path}')
		# Inject token directly into PyngrokConfig (no file roundtrip)
		pyngrok_config = conf.PyngrokConfig(auth_token=token) if token else conf.get_default()
		# Kill ALL ngrok processes (pyngrok-managed + any external ones)
		ngrok.kill()
		try:
			subprocess.run(['taskkill', '/F', '/IM', 'ngrok.exe'], capture_output=True)
		except Exception:
			pass
		time.sleep(3)  # Wait for ngrok cloud to deregister the endpoint
		print('[WOB] Starting ngrok tunnel... (TD Web Server DAT TLS must be OFF)')
		tunnel = ngrok.connect(9980, 'http', pyngrok_config=pyngrok_config)
		url = tunnel.public_url
		print(f'[WOB] ngrok URL: {url}')
	except ImportError:
		print('[WOB] pyngrok not installed - falling back to local HTTPS')
		print('[WOB] To enable ngrok:')
		print('[WOB]   1. pip install pyngrok')
		print('[WOB]   2. ngrok config add-authtoken <YOUR_TOKEN>  (free at ngrok.com)')
		print('[WOB]   3. Set TD Web Server DAT TLS to OFF')
	except Exception as e:
		print(f'[WOB] ngrok failed: {e} - falling back to local HTTPS')

	if url is None:
		ip = get_local_ip()
		url = f'https://{ip}:9980'
		print(f'[WOB] Local URL: {url}')

	print(f'[WOB] Final URL: {url}')
	op('/').store('wob_url', url)  # Store globally for callbacks.py to access
	op('wob_url_text').par.text = url

	# 3. Generate QR code
	try:
		qr = qrcode.QRCode(box_size=10, border=4)
		qr.add_data(url)
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
