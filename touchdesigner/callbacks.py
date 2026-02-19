import json

GITHUB_PAGES_URL = 'https://studio-edul.github.io/Web-Osc-Bridge/'

def onHTTPRequest(webServerDAT, request, response):
	"""
	모바일에서 https://[TD-IP]:9980 접속 시 인증서 수락 페이지 제공.
	인증서 수락 후 GitHub Pages로 자동 리다이렉트하며, TD 주소를 URL 파라미터로 전달.
	"""
	host = request.get('headers', {}).get('Host', '')
	redirect_url = GITHUB_PAGES_URL + ('?td=' + host if host else '')

	response['statusCode'] = 200
	response['statusReason'] = 'OK'
	response['data'] = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WOB - 인증서 수락 완료</title>
  <style>
    body {{ font-family: sans-serif; text-align: center; padding: 60px 20px;
           background: #111; color: #fff; }}
    h1 {{ color: #4caf50; font-size: 2em; margin-bottom: 12px; }}
    p {{ color: #aaa; margin: 8px 0; font-size: 1.1em; }}
  </style>
  <script>
    setTimeout(function() {{
      window.location.href = '{redirect_url}';
    }}, 1200);
  </script>
</head>
<body>
  <h1>&#10003; 인증서 수락 완료</h1>
  <p>WOB 앱으로 이동 중...</p>
</body>
</html>'''
	return response


def onWebSocketReceiveText(webServerDAT, client, data):
	"""모바일에서 전송된 JSON 데이터를 파싱하여 CHOP/Table에 저장"""
	try:
		msg = json.loads(data)
	except:
		return

	vals = op('sensor_vals')
	touchDat = op('touch_vals')

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
		if touchDat:
			touchDat.clear()
			touchDat.appendRow(['id', 'x', 'y', 'state'])
			for i in range(msg.get('count', 0)):
				touchDat.appendRow([
					i,
					msg.get(f't{i}x', 0),
					msg.get(f't{i}y', 0),
					msg.get(f't{i}s', 0)
				])


def onWebSocketOpen(webServerDAT, client):
	print(f'WOB: Client connected - {client}')


def onWebSocketClose(webServerDAT, client):
	print(f'WOB: Client disconnected - {client}')
