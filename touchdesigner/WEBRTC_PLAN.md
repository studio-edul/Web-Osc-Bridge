# WOB WebRTC A/V Streaming Plan

## 목표
모바일 브라우저의 카메라/마이크를 활성화하면
실시간으로 영상/음성을 TouchDesigner로 수신한다.

---

## 아키텍처

```
Mobile Browser
  ├─ getUserMedia (camera / mic)
  ├─ RTCPeerConnection (WebRTC)
  └─ WebSocket (기존 WOB 터널) ← 시그널링 채널

TouchDesigner
  ├─ callbacks.py          ← WebRTC 시그널링 메시지 라우팅
  ├─ webrtc_receiver.py   ← aiortc, asyncio 백그라운드 스레드
  ├─ Script TOP            ← 슬롯별 비디오 프레임 (numpy)
  └─ Script CHOP           ← 슬롯별 오디오 샘플
```

### 시그널링 흐름
```
Mobile                              TD (callbacks.py + webrtc_receiver.py)
  │─── webrtc_offer {slot, sdp} ────→│
  │                                  │  aiortc: setRemoteDescription → createAnswer
  │←── webrtc_answer {sdp} ──────────│
  │─── webrtc_ice {candidate} ───────→│
  │←── webrtc_ice {candidate} ────────│
  │
  │═══════ WebRTC P2P media ══════════│  (STUN 성공 시)
  │  또는 WebSocket media relay        │  (fallback)
```

---

## 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| WebRTC (모바일) | 브라우저 표준 WebRTC API | 별도 라이브러리 없음 |
| WebRTC (TD) | `aiortc` Python 라이브러리 | pip install aiortc |
| 시그널링 채널 | 기존 WOB WebSocket | 별도 서버 불필요 |
| STUN 서버 | stun.l.google.com:19302 | 무료, 동일 네트워크에 적합 |
| TURN 서버 | openrelay.metered.ca (무료) | 다른 네트워크 fallback용 |
| 비디오 → TD | Script TOP + numpy array | aiortc VideoFrame → ndarray |
| 오디오 → TD | Script CHOP | aiortc AudioFrame → ndarray |

---

## 개발 체크리스트

### Phase 1: 패키지 & 환경 준비

- [ ] `wob_setup.py`에 `aiortc` 추가
- [ ] aiortc 의존성 확인 (PyAV, pyOpenSSL, cryptography 등)
- [ ] TD Python 3.11 환경에서 aiortc import 테스트
- [ ] aiortc asyncio 루프 백그라운드 스레드 구조 검증

### Phase 2: 웹 UI (docs/js/, docs/css/)

- [ ] 카메라 / 마이크 토글 버튼 추가 (센서 토글과 동일한 UX)
- [ ] `getUserMedia({ video, audio })` 권한 요청
  - iOS: 반드시 user gesture 내에서 호출 (기존 TAP TO START 버튼 활용)
  - Android: 직접 요청 가능
- [ ] 로컬 비디오 프리뷰 (선택, 작은 pip 형태)
- [ ] RTCPeerConnection 초기화
  - iceServers: STUN (Google) + TURN (openrelay) 설정
- [ ] SDP offer 생성 → WebSocket으로 전송
- [ ] WebSocket으로 SDP answer 수신 → setRemoteDescription
- [ ] ICE candidate 교환 (양방향)
- [ ] 연결 상태 표시 (connecting / connected / failed)
- [ ] wob_config에 `camera` / `microphone` 플래그 추가
  - 서버에서 config push → 자동 활성화 여부 제어

### Phase 3: 시그널링 (touchdesigner/callbacks.py)

- [ ] `onWebSocketReceiveText`에 webrtc 메시지 타입 처리 추가
  - `webrtc_offer` → webrtc_receiver.py의 handle_offer() 호출
  - `webrtc_ice` → webrtc_receiver.py의 handle_ice() 호출
- [ ] TD → 모바일 방향 전송
  - `webrtc_answer` → webSocketSendText
  - `webrtc_ice` → webSocketSendText
- [ ] 슬롯 기반으로 PeerConnection 관리 (slot 1개 = PC 1개)
- [ ] 클라이언트 disconnect 시 PeerConnection 정리

### Phase 4: TD WebRTC 수신 (touchdesigner/webrtc_receiver.py)

- [ ] asyncio 이벤트 루프 → 별도 데몬 스레드에서 실행
- [ ] `RTCPeerConnection` 생성 (슬롯별)
- [ ] STUN/TURN 설정 주입
- [ ] SDP offer 수신 → answer 생성 → 콜백으로 반환
- [ ] ICE candidate 처리
- [ ] VideoTrack 수신 → `frame.to_ndarray(format='rgb24')` → 슬롯별 버퍼에 저장
- [ ] AudioTrack 수신 → numpy array → 슬롯별 버퍼에 저장
- [ ] `get_video_frame(slot)` / `get_audio_samples(slot)` API 제공
- [ ] PeerConnection 종료 (`close_slot(slot)`) 구현
- [ ] `start()` / `stop()` 함수 (wob_init.py에서 호출)

### Phase 5: TD 비디오 출력 (Script TOP)

- [ ] Script TOP 생성 (`webrtc_video_top`) 또는 슬롯별 TOP
- [ ] `cook()`: `webrtc_receiver.get_video_frame(slot)` → `scriptOp.copyNumpyArray()`
- [ ] 해상도 자동 적용 (첫 프레임 기준 또는 고정값)
- [ ] 다중 슬롯: 슬롯별 Script TOP or 배열 처리
- [ ] 프레임 없을 때 검은 화면 fallback

### Phase 6: TD 오디오 출력 (Script CHOP)

- [ ] Script CHOP 생성 (`webrtc_audio_chop`)
- [ ] `cook()`: `webrtc_receiver.get_audio_samples(slot)` → CHOP 채널
- [ ] 샘플레이트 맞추기 (aiortc 기본 48kHz → TD CHOP)
- [ ] 다중 슬롯: 채널별 분리 or 믹스 옵션

### Phase 7: wob_init.py 연동

- [ ] `generate()` 또는 `onStart()`에서 `webrtc_receiver.start()` 호출
- [ ] TD 종료 시 `webrtc_receiver.stop()` 처리

### Phase 8: 테스트 & 안정화

- [ ] 동일 네트워크 (STUN만) 연결 테스트
- [ ] 다른 네트워크 (TURN fallback) 연결 테스트
- [ ] 다중 클라이언트 동시 연결 (슬롯 2~5개)
- [ ] 카메라만 / 마이크만 / 둘 다 케이스
- [ ] 클라이언트 갑자기 끊겼을 때 복구
- [ ] TD 재시작 후 재연결 흐름
- [ ] 모바일 백그라운드 진입 시 스트림 중단 처리
- [ ] iOS Safari / Android Chrome 호환성

---

## 리스크 & 고려사항

| 리스크 | 대응 |
|---|---|
| aiortc가 TD Python 3.11 환경에서 미동작 | 별도 subprocess로 실행하고 Spout/NDI로 TD에 전달 (Plan B) |
| asyncio + TD 메인루프 충돌 | 완전히 별도 스레드에서 asyncio loop 실행 (격리) |
| 다른 네트워크에서 P2P 실패 | TURN 서버 설정 (openrelay 무료 or 자체 coturn) |
| 다중 슬롯 성능 | 해상도 제한 (360p 권장), 프레임레이트 제한 |
| iOS 카메라 권한 | 기존 TAP TO START 버튼에 통합 |
| cloudflared 터널로 미디어 불가 | 시그널링만 터널 사용, 미디어는 P2P (STUN/TURN) |

---

## Plan B: aiortc 실패 시 대안

aiortc가 TD에서 동작하지 않으면:
- 별도 Python 프로세스(`webrtc_bridge.exe`)로 실행
- 비디오: **Spout** (Windows) or **NDI** 로 TD에 전달
- 오디오: **WASAPI loopback** or **NDI audio**
- wob_setup.py에서 해당 프로세스도 자동 설치

---

## 파일 구조 (완성 후)

```
touchdesigner/
  ├─ wob_setup.py          ← aiortc 추가
  ├─ wob_init.py           ← webrtc_receiver.start() 추가
  ├─ callbacks.py          ← webrtc 시그널링 메시지 처리 추가
  ├─ webrtc_receiver.py   ← NEW: aiortc 백그라운드 수신기
  └─ WEBRTC_PLAN.md

docs/js/
  ├─ app.js                ← 카메라/마이크 UI 연동
  ├─ webrtc.js             ← NEW: RTCPeerConnection, 시그널링
  └─ ...
```
