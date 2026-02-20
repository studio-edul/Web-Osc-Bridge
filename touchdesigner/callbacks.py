import json

GITHUB_PAGES_URL = 'https://studio-edul.github.io/Web-Osc-Bridge/'
MAX_CLIENTS = 5

# Maps client address -> slot number (1~5)
_client_slots = {}
# Available slot pool
_free_slots = list(range(1, MAX_CLIENTS + 1))

SENSOR_COLS = [
	'slot', 'connected',
	'ax', 'ay', 'az',
	'ga', 'gb', 'gg',
	'oa', 'ob', 'og',
	'lat', 'lon',
	'touch_count',
]


def init_tables():
	"""Initialize sensor_table and touch_table DATs. Called from Execute DAT onStart()."""
	t = op('sensor_table')
	if t is not None:
		t.clear()
		t.appendRow(SENSOR_COLS)
		for i in range(1, MAX_CLIENTS + 1):
			row = [i, 0] + [0.0] * (len(SENSOR_COLS) - 2)
			t.appendRow(row)
		print(f'[WOB] sensor_table initialized ({MAX_CLIENTS} slots)')
	else:
		print('[WOB] sensor_table DAT not found - create a Table DAT named "sensor_table"')

	tt = op('touch_table')
	if tt is not None:
		tt.clear()
		tt.appendRow(['slot', 'touch_id', 'x', 'y', 'state'])
		print('[WOB] touch_table initialized')
	else:
		print('[WOB] touch_table DAT not found - create a Table DAT named "touch_table"')


def onHTTPRequest(webServerDAT, request, response):
	"""Serve cert acceptance page and redirect to GitHub Pages with TD address as param."""
	# Use the URL stored at startup (set by qr_execute_dat.py) for reliable ngrok support.
	# This avoids issues where ngrok rewrites the Host header to localhost.
	host = ''
	url_node = op('wob_url_text')
	if url_node:
		stored = str(url_node.par.text).strip()
		host = stored.replace('https://', '').replace('http://', '')
	if not host:
		host = request.get('headers', {}).get('Host', '')
	redirect_url = GITHUB_PAGES_URL + ('?td=' + host if host else '')

	response['statusCode'] = 200
	response['statusReason'] = 'OK'
	response['data'] = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WOB</title>
  <style>
    body {{ font-family: sans-serif; text-align: center; padding: 40px 20px;
           background: #111; color: #fff; }}
    h1 {{ color: #4caf50; font-size: 2em; margin-bottom: 12px; }}
    p {{ color: #aaa; margin: 8px 0; }}
    a {{ color: #4caf50; font-size: 1.1em; word-break: break-all; }}
  </style>
  <script>
    window.location.href = '{redirect_url}';
  </script>
</head>
<body>
  <h1>&#10003; WOB</h1>
  <p>Redirecting...</p>
  <p><a href="{redirect_url}">Tap here if not redirected</a></p>
</body>
</html>'''
	return response


def onWebSocketOpen(webServerDAT, client):
	global _free_slots
	addr = str(client.address)

	if not _free_slots:
		print(f'[WOB] No slots available (max {MAX_CLIENTS}). Connection ignored: {addr}')
		return

	slot = _free_slots.pop(0)
	_client_slots[addr] = slot

	t = op('sensor_table')
	if t is not None:
		t[slot, 'connected'] = 1

	print(f'[WOB] Client connected -> slot {slot} | {addr} | {MAX_CLIENTS - len(_free_slots)} active')


def onWebSocketClose(webServerDAT, client):
	global _free_slots
	addr = str(client.address)
	slot = _client_slots.pop(addr, None)

	if slot is None:
		return

	_free_slots.append(slot)
	_free_slots.sort()

	# Clear sensor_table row for this slot
	t = op('sensor_table')
	if t is not None:
		for col in SENSOR_COLS[1:]:
			t[slot, col] = 0

	# Remove touch_table rows for this slot
	tt = op('touch_table')
	if tt is not None:
		rows_to_delete = [
			r for r in range(1, tt.numRows)
			if int(tt[r, 'slot']) == slot
		]
		for r in reversed(rows_to_delete):
			tt.deleteRow(r)

	print(f'[WOB] Client disconnected -> slot {slot} | {addr} | {MAX_CLIENTS - len(_free_slots)} active')


def onWebSocketReceiveText(webServerDAT, client, data):
	addr = str(client.address)
	slot = _client_slots.get(addr)
	if slot is None:
		return

	try:
		msg = json.loads(data)
	except:
		return

	t = op('sensor_table')

	if msg.get('type') == 'sensor':
		if t is None:
			return
		t[slot, 'ax'] = msg.get('ax', 0)
		t[slot, 'ay'] = msg.get('ay', 0)
		t[slot, 'az'] = msg.get('az', 0)
		t[slot, 'ga'] = msg.get('ga', 0)
		t[slot, 'gb'] = msg.get('gb', 0)
		t[slot, 'gg'] = msg.get('gg', 0)
		t[slot, 'oa'] = msg.get('oa', 0)
		t[slot, 'ob'] = msg.get('ob', 0)
		t[slot, 'og'] = msg.get('og', 0)
		t[slot, 'lat'] = msg.get('lat', 0)
		t[slot, 'lon'] = msg.get('lon', 0)

	elif msg.get('type') == 'touch':
		count = msg.get('count', 0)
		if t is not None:
			t[slot, 'touch_count'] = count

		tt = op('touch_table')
		if tt is not None:
			rows_to_delete = [
				r for r in range(1, tt.numRows)
				if int(tt[r, 'slot']) == slot
			]
			for r in reversed(rows_to_delete):
				tt.deleteRow(r)
			for i in range(count):
				tt.appendRow([
					slot, i,
					msg.get(f't{i}x', 0),
					msg.get(f't{i}y', 0),
					msg.get(f't{i}s', 0),
				])
