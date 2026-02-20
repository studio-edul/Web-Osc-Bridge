import json

GITHUB_PAGES_URL = 'https://studio-edul.github.io/Web-Osc-Bridge/'
# Default - overridden by wob_config DAT at init_tables() time
MAX_CLIENTS = 20

# Maps client address -> slot number (1~MAX_CLIENTS)
_client_slots = {}
# Available slot pool
_free_slots = list(range(1, MAX_CLIENTS + 1))
# Touch count per slot - tracked in Python to avoid reading back from TD table
_slot_touch_count = {}


def _read_config():
	"""Read settings from wob_config Table DAT (key | value).
	Falls back to defaults if DAT not found."""
	cfg = op('wob_config')
	if cfg is None:
		return {}
	out = {}
	for r in range(1, cfg.numRows):
		try:
			out[str(cfg[r, 0])] = str(cfg[r, 1])
		except Exception:
			pass
	return out

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
	global _client_slots, _free_slots, _slot_touch_count, MAX_CLIENTS

	cfg = _read_config()
	if 'max_clients' in cfg:
		try:
			MAX_CLIENTS = max(1, int(cfg['max_clients']))
		except ValueError:
			pass

	_client_slots = {}
	_free_slots = list(range(1, MAX_CLIENTS + 1))
	_slot_touch_count = {}

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
	stored_url = op('/').fetch('wob_url', '')
	host = stored_url.replace('https://', '').replace('http://', '').strip()
	if not host:
		host = request.get('headers', {}).get('Host', '')
	print(f'[WOB] HTTP request -> host: {host}')
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
	try:
		addr = str(client)
		print(f'[WOB] WS open from {addr}')

		if not _free_slots:
			print(f'[WOB] No slots available (max {MAX_CLIENTS}). Connection ignored: {addr}')
			return

		slot = _free_slots.pop(0)
		_client_slots[addr] = slot

		t = op('sensor_table')
		if t is not None:
			t[slot, 'connected'] = 1
		else:
			print('[WOB] WARN: sensor_table not found in onWebSocketOpen')

		print(f'[WOB] Client connected -> slot {slot} | {addr} | {MAX_CLIENTS - len(_free_slots)} active')

		webServerDAT.webSocketSendText(client, json.dumps({'type': 'ack', 'slot': slot}))
	except Exception as e:
		print(f'[WOB] ERROR in onWebSocketOpen: {e}')


def onWebSocketClose(webServerDAT, client):
	global _free_slots
	addr = str(client)
	slot = _client_slots.pop(addr, None)

	if slot is None:
		return

	_free_slots.append(slot)
	_free_slots.sort()
	_slot_touch_count.pop(slot, None)

	# Reset sensor_table row in one call
	t = op('sensor_table')
	if t is not None:
		t.replaceRow(slot, [slot, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

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
	global _free_slots
	addr = str(client)
	slot = _client_slots.get(addr)
	if slot is None:
		# Module was reloaded while client was connected - auto-recover slot
		if _free_slots:
			slot = _free_slots.pop(0)
			_client_slots[addr] = slot
			t2 = op('sensor_table')
			if t2 is not None:
				t2[slot, 'connected'] = 1
			print(f'[WOB] Recovered slot {slot} for {addr} after module reload')
		else:
			print(f'[WOB] WARN: data from unknown addr={addr}, no free slots')
			return

	try:
		msg = json.loads(data)
	except Exception:
		return

	msg_type = msg.get('type')

	if msg_type == 'sensor':
		t = op('sensor_table')
		if t is None:
			return
		g = msg.get
		# Single replaceRow call instead of 11 individual cell writes
		t.replaceRow(slot, [
			slot, 1,
			g('ax', 0), g('ay', 0), g('az', 0),
			g('ga', 0), g('gb', 0), g('gg', 0),
			g('oa', 0), g('ob', 0), g('og', 0),
			g('lat', 0), g('lon', 0),
			_slot_touch_count.get(slot, 0),
		])

	elif msg_type == 'touch':
		count = msg.get('count', 0)
		_slot_touch_count[slot] = count
		t = op('sensor_table')
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
			g = msg.get
			for i in range(count):
				tt.appendRow([slot, i, g(f't{i}x', 0), g(f't{i}y', 0), g(f't{i}s', 0)])

	elif msg_type == 'hello':
		print(f'[WOB] Hello from slot {slot} - OK')
