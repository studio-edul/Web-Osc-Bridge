import json

def onWebSocketReceiveText(webServerDAT, client, data):
	"""모바일에서 전송된 JSON 데이터를 파싱하여 Constant CHOP에 저장"""
	try:
		msg = json.loads(data)
	except:
		return

	vals = op('sensor_vals')

	if msg.get('type') == 'sensor':
		vals.par.value0 = msg.get('ax', 0)   # Accel X
		vals.par.value1 = msg.get('ay', 0)   # Accel Y
		vals.par.value2 = msg.get('az', 0)   # Accel Z
		vals.par.value3 = msg.get('ga', 0)   # Gyro Alpha
		vals.par.value4 = msg.get('gb', 0)   # Gyro Beta
		vals.par.value5 = msg.get('gg', 0)   # Gyro Gamma
		vals.par.value6 = msg.get('oa', 0)   # Orient Alpha
		vals.par.value7 = msg.get('ob', 0)   # Orient Beta
		vals.par.value8 = msg.get('og', 0)   # Orient Gamma
		vals.par.value9 = msg.get('lat', 0)  # GPS Lat
		vals.par.value10 = msg.get('lon', 0) # GPS Lon

	elif msg.get('type') == 'touch':
		vals.par.value11 = msg.get('count', 0)
		# 터치 좌표는 별도 Constant CHOP이나 Table DAT에 저장 가능

def onWebSocketOpen(webServerDAT, client):
	print(f'WOB: Client connected - {client}')

def onWebSocketClose(webServerDAT, client):
	print(f'WOB: Client disconnected - {client}')
