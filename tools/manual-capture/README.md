# SamhanLogis 매뉴얼 캡처 도구

`tools/manual-capture/` — Playwright 자동 캡처 + Sharp 박스/화살표 어노테이션 인프라. 운영자 매뉴얼 (Phase 10 Step 7) 의 화면 자동 생성을 담당한다.

## 목적

- 매뉴얼 작성자 (Designer agent / PM agent) 가 `capture.config.json` 에 화면 placeholder 만 명시
- 본 도구가 실제 service + client 를 띄운 환경에서 자동 캡처 + 어노테이션 합성
- `output/*.annotated.png` 를 `docs/manual/screenshots/` 로 복사 (수동, gitignore 산출물)

## 구성

```
tools/manual-capture/
├── package.json                    # playwright + sharp 의존성
├── README.md                       # 본 문서
├── capture.config.json             # 화면별 캡처 정의 (Stage 1 = desktop 2 화면 예제)
├── annotate.js                     # 박스/화살표 SVG overlay → Sharp 합성
├── capture-desktop.js              # desktop client (Vite dev 5173) 캡처
├── capture-mobile.js               # mobile-staff client (Expo web 8081) 캡처
├── data-testid-required.md         # frontend-engineer 가 추가해야 할 testid 백로그
├── .gitignore                      # output/, node_modules/
└── output/                         # 산출 PNG (gitignore — 사용자 PC 에서 매번 생성)
```

## 사용법

### Step 1: 인프라 + service 가동

```powershell
.\infrastructure\scripts\start-local-full.ps1
```

PostgreSQL 14 services + 14 spring-boot service 가 가동될 때까지 대기 (약 1~2 분).

### Step 2: desktop client 가동 (별도 터미널)

```powershell
cd clients\desktop
npm run dev
```

Electron + Vite dev server 가 `http://localhost:5173` 에 listen. (Electron 창은 무시 가능 — Playwright 가 직접 5173 접근)

mock 모드만 필요하면:

```powershell
cd clients\desktop
$env:VITE_MOCK_MODE = '1'; npx vite
```

### Step 3: 캡처 실행

```powershell
cd tools\manual-capture
npm install
node capture-desktop.js
```

산출:

- `output/00-login.png` — 원본
- `output/00-login.annotated.png` — 박스 3개 (ID 입력 / PW 입력 / 로그인 버튼) 합성
- `output/00-main-sidebar.png` + `.annotated.png`

### Step 4: mobile-staff 캡처 (옵션)

```powershell
cd clients\mobile-staff
npx expo start --web --port 8081
```

별도 터미널:

```powershell
cd tools\manual-capture
node capture-mobile.js
```

(Stage 1 의 `capture.config.json` 은 mobile 화면 0개 — Stage 2 에서 추가 예정.)

### Step 5: 매뉴얼 디렉토리로 sync (Stage 3 자동화)

```powershell
node tools\manual-capture\sync-screenshots.js
```

`sync-screenshots.js` 동작:

1. `docs/manual/**/*.md` 의 모든 `../screenshots/<섹션>/<file>.png` link 추출 (55 개 ref)
2. `sync-screenshots.js` 의 `CAPTURE_MAP` 에 따라 `output/<id>.png` → `docs/manual/screenshots/<섹션>/<file>.png` 복사
3. 매핑 없는 매뉴얼 image 는 `_placeholder-screenshot-pending.png` 로 폴백
4. 보고: 실 캡처 적용 / placeholder 적용 / 미사용 capture / link 검증 결과

새 화면을 캡처에 추가하면 `CAPTURE_MAP` 도 갱신해야 한다 (미갱신 시 `[미사용 capture]` 로 보고됨).

## 화면 추가 절차

1. `capture.config.json` 의 `screens[]` 배열에 새 항목 추가:

   ```json
   {
     "id": "01-warehouse-list",
     "category": "01-창고관리",
     "name": "창고 목록 조회",
     "client": "desktop",
     "url": "/#/warehouses",
     "auth": "kimmiseon",
     "annotations": [
       { "type": "box", "selector": "[data-testid='warehouse-add-button']", "label": "1. 창고 추가" },
       { "type": "box", "selector": "[data-testid='warehouse-list-table']", "label": "2. 창고 목록" }
     ]
   }
   ```

2. 필요한 `data-testid` 가 desktop UI 에 없으면 `data-testid-required.md` 에 추가 → frontend-engineer agent 백로그.

3. `node capture-desktop.js` 재실행.

## annotation 타입

### `box` — 붉은 사각형 + 좌상단 한국어 label

```json
{ "type": "box", "selector": "[data-testid='login-id-input']", "label": "1. 로그인 ID 입력" }
```

또는 절대 좌표:

```json
{ "type": "box", "x": 100, "y": 200, "w": 300, "h": 40, "label": "1. 로그인 ID 입력" }
```

### `arrow` — 노란 화살표 + 끝점 label

```json
{ "type": "arrow", "from": [800, 300], "to": [600, 200], "label": "여기 클릭" }
```

(현재는 절대 좌표만 지원 — selector 기반 화살표는 Stage 2.)

## 인증 (`auth`)

`capture.config.json` 의 `auth` 객체에 사전 등록된 키 사용. 누락 시 `null` 명시.

```json
"auth": {
  "kimmiseon": { "loginId": "kimmiseon", "passwordEnv": "QA_MASTER_PASSWORD" },
  "salesUser": { "loginId": "salesuser", "passwordEnv": "QA_MASTER_PASSWORD" }
}
```

`start-local-full.ps1` 가 seed 한 계정과 일치해야 함.

## 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-------------|
| `selector 미발견 → ... skip` | desktop UI 에 `data-testid` 누락. `data-testid-required.md` 갱신 + frontend agent 작업 요청 |
| `pageerror` 다수 | service 미가동 → API 호출 실패. Step 1 재확인 |
| Edge / chromium 미설치 | `npx playwright install msedge` 또는 `npx playwright install chromium` |
| 한글 깨짐 (label) | Windows 환경 폰트 누락. `Malgun Gothic` 시스템 기본 — annotate.js 의 FONT_FAMILY 확인 |
| 캡처 타이밍 불안정 | `defaults.desktop.waitMs` 를 2000~3000 으로 증가 |

## 협업

- 다른 agent 와 동일 branch (병렬 작업 전제)
- 본 디렉토리 신규 파일만 추가 — 기존 코드 수정 없음
- `node_modules/` 와 `output/` 은 gitignore — 사용자 PC 에서 매번 `npm install` + 캡처 실행

## Stage 로드맵

- **Stage 1** — 인프라 setup + 예제 2 화면 (00-login, 00-main-sidebar)
- **Stage 2** — 매뉴얼 전체 화면 정의 + 자동 복사 스크립트
- **Stage 3 (현재)** — desktop 14 화면 + mobile 4 화면 정의 + `sync-screenshots.js` (CAPTURE_MAP + placeholder 폴백) + 매뉴얼 link 검증
- **Stage 4** — frontend-engineer 가 `data-testid-required.md` 의 testid 추가 → annotation 박스 활성화
- **Stage 5** — CI 통합 (PR QA 캡처 자동화) + diff 비교 (시각 회귀 테스트)
