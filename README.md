# WOB - Web to TouchDesigner Bridge

모바일 브라우저의 센서 데이터(모션, 터치, GPS)를 TouchDesigner로 직접 실시간 전송하는 WebSocket 기반 가교 시스템.

## Architecture

```
[Mobile Browser] ──WebSocket──> [TouchDesigner Web Server DAT]
  (GitHub Pages)                   (수신 PC에서 실행 중)
```

별도 서버 설치 없이 모바일에서 TD로 직접 연결됩니다.

## Quick Start

### 1. TouchDesigner 설정

#### Step 1: Web Server DAT 생성
1. OP Create Dialog → DAT → **Web Server**
2. Parameters 설정:
   - **Active** → `On`
   - **Port** → `9980`

#### Step 2: Constant CHOP 생성 (데이터 저장용)
1. OP Create Dialog → CHOP → **Constant**
2. Name → `sensor_vals`
3. Parameters에서 채널 추가:
   - `chan1` ~ `chan12` (ax, ay, az, ga, gb, gg, oa, ob, og, lat, lon, touch_count)

#### Step 3: Callbacks DAT 설정
Web Server DAT을 생성하면 자동으로 `webserverdat1_callbacks` DAT이 함께 생성됩니다.
해당 Callbacks DAT에 아래 코드를 입력합니다:

```python
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
```

#### Step 4: 연결 확인
- Web Server DAT의 테이블에 WebSocket 연결 상태가 표시됩니다
- Constant CHOP에서 실시간으로 센서 값이 업데이트되는지 확인

### 2. 모바일 접속

GitHub Pages URL 또는 로컬에서 접속:

1. TouchDesigner IP:Port 입력 (예: `192.168.0.100:9980`)
2. **Connect to TD** → **Enable Sensors** → **Start Broadcast**

### 3. 로컬 개발 (선택)

```bash
npm run dev
```

`http://localhost:3000`에서 프론트엔드를 확인할 수 있습니다.

## Data Format (JSON)

### Sensor Message
```json
{
  "type": "sensor",
  "ax": 0.12, "ay": -0.98, "az": 0.05,
  "ga": 0.01, "gb": -0.03, "gg": 0.02,
  "oa": 0.45, "ob": 0.52, "og": 0.48,
  "lat": 37.5665, "lon": 126.9780
}
```

### Touch Message
```json
{
  "type": "touch",
  "count": 2,
  "t0x": 0.35, "t0y": 0.72, "t0s": 1,
  "t1x": 0.68, "t1y": 0.45, "t1s": 1
}
```

| Key | Description | Range |
|-----|-------------|-------|
| `ax, ay, az` | Accelerometer (normalized to g) | -1.0 ~ 1.0 |
| `ga, gb, gg` | Gyroscope (rotation rate) | -1.0 ~ 1.0 |
| `oa, ob, og` | Orientation (alpha, beta, gamma) | 0.0 ~ 1.0 |
| `lat, lon` | GPS coordinates | raw |
| `tNx, tNy` | Touch N position (normalized) | 0.0 ~ 1.0 |
| `tNs` | Touch N state | 0=up, 1=down |
| `count` | Active touch count | integer |

## Features

- Motion 센서 (가속도계 + 자이로스코프)
- Device Orientation (방향)
- 멀티터치 트래킹 (좌표 정규화 0.0~1.0)
- GPS (위도/경도)
- 실시간 Canvas 시각화 (Sparkline 그래프)
- 샘플레이트 조절 (5~60Hz)
- Wake Lock (화면 꺼짐 방지)
- Haptic Feedback
- Auto-Reconnect
- 설정 자동 저장 (LocalStorage)

## GitHub Pages 배포

1. GitHub repo 생성 후 push
2. Settings → Pages → Source: `main` branch, `/docs` folder
3. HTTPS가 자동 적용되어 모바일 센서 접근 가능

## References

- [Web Server DAT - TouchDesigner Docs](https://docs.derivative.ca/Web_Server_DAT)
- [WebSocket DAT - TouchDesigner Docs](https://docs.derivative.ca/WebSocket_DAT)
