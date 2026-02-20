# DAT Execute DAT — watches wob_config Table DAT
# Setup in TD:
#   1. Create a DAT Execute DAT
#   2. Set "DATs" parameter to: wob_config
#   3. Enable "Table Change" checkbox
#   4. Paste this script as its content (or point it to this file)


def onTableChange(dat):
	"""Auto-broadcast config to all connected mobiles when wob_config changes."""
	try:
		web = op('web_server_dat')
		if web is None:
			print('[WOB] web_server_dat not found — update the op name in config_watch_dat.py')
			return
		web.module.broadcast_config(web)
	except Exception as e:
		print(f'[WOB] Config broadcast error: {e}')


# Required stubs (DAT Execute DAT expects these)
def onRowChange(dat, rows):
	pass

def onColChange(dat, cols):
	pass

def onCellChange(dat, cells, prev):
	pass

def onSizeChange(dat):
	pass
