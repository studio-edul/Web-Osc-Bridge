# WOB WebRTC A/V Streaming Plan

## 목표
모바일 브라우저의 카메라/마이크를 활성화하면
실시간으로 영상/음성을 TouchDesigner로 수신한다.

---

## 아키텍처 (TD 네이티브 — aiortc 불필요)

TD에는 WebRTC 네이티브 지원이 내장되어 있음:
- **WebRTC DAT** → 피어 연결 관리 (Python API)
- **Video Stream In TOP** → WebRTC DAT 참조하면 브라우저 카메라 바로 수신
- **Audio Stream In CHOP** → 동일하게 오디오 수신
- **시그널링** → 기존 WOB Web Server DAT WebSocket 재활용 (별도 서버 불필요)

```
Mobile Browser
  ├─ getUserMedia (camera / mic)
  ├─ RTCPeerConnection
  └─ WebSocket (기존 WOB 터널) ← 시그널링 채널

TouchDesigner
  ├─ Web Server DAT (callbacks.py)  ← WebRTC 시그널링 메시지 라우팅
  ├─ WebRTC DAT (webrtc_callbacks.py) ← onAnswer, onIceCandidate
  ├─ Video Stream In TOP            ← WebRTC DAT 참조 → 브라우저 카메라
  └─ Audio Stream In CHOP           ← WebRTC DAT 참조 → 브라우저 마이크
```

### 시그널링 흐름
```
Mobile                              TD
  │─── webrtc_offer {sdp} ──────────→│ callbacks.py
  │                                  │  setRemoteDescription(connId, 'offer', sdp)
  │                                  │  createAnswer(connId) → onAnswer 콜백 발동
  │←── webrtc_answer {sdp} ──────────│ webrtc_callbacks.py onAnswer
  │─── webrtc_ice {candidate} ───────→│ callbacks.py → addIceCandidate
  │←── webrtc_ice {candidate} ────────│ webrtc_callbacks.py onIceCandidate
  │═══ WebRTC P2P 미디어 ═════════════│ Video Stream In TOP / Audio Stream In CHOP
```

---

## TD WebRTC DAT Python API

```python
# 시그널링 수신 후 TD에서 answer 생성
webrtcDAT.setRemoteDescription(connectionId, 'offer', sdp)
webrtcDAT.createAnswer(connectionId)  # → onAnswer 콜백 발동

# onAnswer 콜백 (webrtc_callbacks.py)
def onAnswer(webrtcDAT, connectionId, localSdp):
    webrtcDAT.setLocalDescription(connectionId, 'answer', localSdp)
    # WebSocket으로 브라우저에 answer 전송

# ICE candidate 수신
webrtcDAT.addIceCandidate(connectionId, candidate, lineIndex, sdpMid)

# onIceCandidate 콜백 (webrtc_callbacks.py)
def onIceCandidate(webrtcDAT, connectionId, candidate, lineIndex, sdpMid):
    # WebSocket으로 브라우저에 candidate 전송
```

connectionId = 슬롯 번호 문자열 (예: '1', '2', ...)

---

## 필요한 TD 노드 (수동 생성)

| 노드 이름 | 타입 | 설정 |
|---|---|---|
| `webrtc_dat` | WebRTC DAT | Callbacks DAT = `webrtc_callbacks` |
| `webrtc_video_1` | Video Stream In TOP | Protocol = WebRTC, WebRTC DAT = `webrtc_dat`, Peer = 1 |
| `webrtc_audio_1` | Audio Stream In CHOP | Protocol = WebRTC, WebRTC DAT = `webrtc_dat`, Peer = 1 |

---

## 기술 스택

| 항목 | 선택 |
|---|---|
| WebRTC (모바일) | 브라우저 표준 WebRTC API |
| WebRTC (TD) | TD 내장 WebRTC DAT + Video/Audio Stream operators |
| 시그널링 채널 | 기존 WOB Web Server DAT WebSocket |
| STUN 서버 | stun.l.google.com:19302 (무료, 가입 불필요) |
| TURN 서버 | openrelay.metered.ca 무료 (다른 네트워크 fallback) |
| 추가 pip 패키지 | 없음 |

---

## 개발 체크리스트

### Phase 1: TD 파일 ✅ (구현 완료)

- [x] `webrtc_callbacks.py` 생성
  - `onAnswer`: setLocalDescription → WebSocket으로 answer 전송
  - `onIceCandidate`: WebSocket으로 candidate 전송
- [x] `callbacks.py` 업데이트
  - `webrtc_offer` 메시지 처리 → setRemoteDescription + createAnswer
  - `webrtc_ice` 메시지 처리 → addIceCandidate
  - Web Server DAT 경로 저장 (webrtc_callbacks.py에서 참조)
  - wob_config에 `camera`, `microphone` 추가

### Phase 2: 웹 UI ✅ (구현 완료)

- [x] `docs/js/webrtc.js` 생성
  - getUserMedia (camera / mic)
  - RTCPeerConnection (STUN + TURN)
  - SDP offer 생성 → WebSocket 전송
  - answer 수신 → setRemoteDescription
  - ICE candidate 교환
  - 스트림 중지 / 재시작
- [x] `docs/index.html` 카메라/마이크 토글 버튼 추가
- [x] `docs/css/style.css` 스타일 추가
- [x] `docs/js/app.js` WebRTC 모듈 연동, config 처리

### Phase 3: TD 노드 설정 (수동, 사용자 작업)

- [ ] WebRTC DAT 생성 및 이름 `webrtc_dat` 설정
- [ ] Callbacks DAT = `webrtc_callbacks` 연결
- [ ] STUN/TURN 서버 설정 (ICE Servers 파라미터)
- [ ] Video Stream In TOP 생성 (`webrtc_video_1`)
  - Protocol = WebRTC
  - WebRTC DAT = `webrtc_dat`
  - Peer = 1 (슬롯별로 추가)
- [ ] Audio Stream In CHOP 생성 (`webrtc_audio_1`)

### Phase 4: 테스트 & 안정화

- [ ] 동일 네트워크 (STUN만) 연결 테스트
- [ ] 다른 네트워크 (TURN fallback) 테스트
- [ ] 다중 클라이언트 동시 연결 (슬롯 2~5개)
- [ ] 카메라만 / 마이크만 / 둘 다 케이스
- [ ] 클라이언트 끊겼을 때 복구
- [ ] iOS Safari / Android Chrome 호환성

---

## 리스크 & 고려사항

| 리스크 | 대응 |
|---|---|
| 다른 네트워크에서 P2P 실패 | TURN 서버 (openrelay 무료) |
| iOS 카메라 권한 | 기존 TAP TO START 버튼에 통합 |
| cloudflared 터널로 미디어 불통 | 시그널링만 터널, 미디어는 P2P |
| 다중 슬롯 동시 비디오 | Video Stream In TOP 슬롯별로 생성 |

---

## 파일 구조 (완성 후)

```
touchdesigner/
  ├─ wob_setup.py
  ├─ wob_init.py
  ├─ callbacks.py          ← webrtc 시그널링 메시지 처리 추가
  ├─ webrtc_callbacks.py  ← NEW
  └─ WEBRTC_PLAN.md

docs/js/
  ├─ app.js               ← webrtc 모듈 연동 추가
  ├─ webrtc.js            ← NEW
  └─ ...
```
