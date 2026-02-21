# DAT Execute DAT — watches wob_config Table DAT
# Setup in TD:
#   1. Create a DAT Execute DAT
#   2. Set "DATs" parameter to: wob_config
#   3. Enable "Table Change" checkbox
#   4. Paste this script as its content (or point it to this file)
#
# This script is self-contained: reads wob_config and sends to all
# connected clients directly, without calling into callbacks.py.

import json


def _broadcast():
	"""Read wob_config and push to all connected clients."""
	web = op('web_server_dat')
	if web is None:
		print('[WOB] config_watch: web_server_dat not found — update op name')
		return

	# Read wob_config
	cfg = {}
	tbl = op('wob_config')
	if tbl is not None:
		for r in range(1, tbl.numRows):
			try:
				cfg[str(tbl[r, 0])] = str(tbl[r, 1])
			except Exception:
				pass

	msg = json.dumps({
		'type':               'config',
		'sample_rate':        int(cfg.get('sample_rate', 30)),
		'wake_lock':          int(cfg.get('wake_lock', 1)),
		'haptic':             int(cfg.get('haptic', 1)),
		'sensor_motion':      int(cfg.get('sensor_motion', 1)),
		'sensor_orientation': int(cfg.get('sensor_orientation', 1)),
		'sensor_geolocation': int(cfg.get('sensor_geolocation', 0)),
		'sensor_touch':       int(cfg.get('sensor_touch', 1)),
		'dev_mode':           int(cfg.get('dev_mode', 1)),
	})

	# Use persistent client slots (stored by callbacks.py)
	client_slots = op('/').fetch('wob_client_slots', {})
	count = 0
	for addr in list(client_slots.keys()):
		try:
			web.webSocketSendText(addr, msg)
			count += 1
		except Exception:
			pass

	print(f'[WOB] Config broadcast -> {count} clients')


def onTableChange(dat):
	try:
		_broadcast()
	except Exception as e:
		print(f'[WOB] Config broadcast error: {e}')


# Required stubs
def onRowChange(dat, rows):
	pass

def onColChange(dat, cols):
	pass

def onCellChange(dat, cells, prev):
	pass

def onSizeChange(dat):
	pass
