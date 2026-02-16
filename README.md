# WOB - Web to TouchDesigner Bridge

모바일 브라우저의 센서 데이터(모션, 터치, GPS)를 TouchDesigner로 직접 실시간 전송하는 WebSocket 기반 가교 시스템.

## Architecture

```
[Mobile Browser] ──WebSocket──> [TouchDesigner WebSocket DAT]
  (GitHub Pages)                   (수신 PC에서 실행 중)
```

별도 서버 설치 없이 모바일에서 TD로 직접 연결됩니다.

## Quick Start

### 1. TouchDesigner 설정

1. **WebSocket DAT** 생성
2. Parameters:
   - Network Protocol → `WebSocket`
   - Connection Type → `Server`
   - Port → `9980`
   - Active → `On`

3. WebSocket DAT의 Callbacks에서 JSON 파싱:

```python
import json

def onReceiveText(dat, rowIndex, message, bytes, peer):
    data = json.loads(message)

    if data['type'] == 'sensor':
        # data['ax'], data['ay'], data['az']  - Accelerometer (-1 ~ 1)
        # data['ga'], data['gb'], data['gg']  - Gyroscope (-1 ~ 1)
        # data['oa'], data['ob'], data['og']  - Orientation (0 ~ 1)
        # data['lat'], data['lon']            - GPS

        op('sensor_vals').par.value0 = data['ax']
        op('sensor_vals').par.value1 = data['ay']
        op('sensor_vals').par.value2 = data['az']

    elif data['type'] == 'touch':
        # data['count']     - Active touch count
        # data['t0x'], data['t0y'], data['t0s']  - Touch 0 (x, y, state)
        # data['t1x'], data['t1y'], data['t1s']  - Touch 1
        pass
```

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
