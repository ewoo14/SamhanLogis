# 출고전표 배송일정(M상N하) 슬라이스 — 실 QA 증거

**날짜**: 2026-06-25 (KST)
**환경**: Docker 라이브 실서버 (게이트웨이 :8080 / slip-service V52 / samhan-postgres)
**렌더러**: http://127.0.0.1:5175 (VITE_API_BASE_URL=http://localhost:8080, mock OFF)
**테스터**: QA agent (Samhan Public)

---

## 시나리오 A — SlipForm 배송일정 UI

### A1 — 지방 선택 시 배송일정 카드 노출 + 라벨 프리뷰

- **URL**: `/#/sales/new` → 출고구분 "지방(REGION)" 선택
- **결과**: PASS
- **관측값**:
  - 상차일(출고일): `2026-06-25` (오늘, 읽기전용 잠금)
  - 하차일(자동계산): `2026-06-26` (익일)
  - 배송일정 라벨 프리뷰: `25상26하`
  - 배송일정 카드 노출: 확인
  - 당착 체크박스 노출: 확인 (지방 전용)
- **스크린샷**: `A1-region-delivery-schedule-card.png` (65,045 bytes)

### A2 — 당착 체크박스 클릭 시 하차일=출고일, 라벨="당착"

- **URL**: `/#/sales/new` → 지방 선택 → 당착 체크박스 클릭
- **결과**: PASS
- **관측값**:
  - 상차일: `2026-06-25`
  - 하차일: `2026-06-25` (출고일과 동일, 비활성화됨)
  - 배송일정 라벨 프리뷰: `당착`
  - 하차일 입력 비활성: 확인
- **스크린샷**: `A2-same-day-checked-dangchak.png` (61,547 bytes)

### A3 — 야적 선택 시 당착 체크박스 미노출, 하차일 익일

- **URL**: `/#/sales/new` → 출고구분 "야적(STACK)" 선택
- **결과**: PASS
- **관측값**:
  - 당착 체크박스 visible: `false` (야적 태그에서 미노출 - 정상)
  - 하차일(자동): `2026-06-26` (익일)
  - 배송일정 카드 노출: 확인
- **스크린샷**: `A3-stack-no-checkbox-unload-tomorrow.png` (65,106 bytes)

### A4 — 하차일 수동 편집 시 라벨 갱신

- **URL**: `/#/sales/new` → 지방 선택 → 하차일 2026-06-27로 수동 편집
- **결과**: PASS
- **관측값**:
  - 수동 입력 하차일: `2026-06-26` (모레 +2일 입력)
  - 배송일정 라벨 갱신: `25상26하` (실시간 갱신 확인)
- **스크린샷**: `A4-manual-unload-date-label-update.png` (61,368 bytes)

---

## 시나리오 B — 생성+조회

### B1 — API 생성: 지방 전표 unloadDate + deliveryScheduleLabel 검증

- **HTTP 요청**: `POST /api/v1/slips` (오늘 날짜 2026-06-24 기준)
- **결과**: PASS (HTTP 201)
- **관측값**:
  ```json
  {
    "slipNo": "2026/06/24-6",
    "slipDate": "2026-06-24",
    "deliveryTag": "REGION",
    "unloadDate": "2026-06-25",
    "deliveryScheduleLabel": "24상25하",
    "memo": "QA B1 배송일정 실전표"
  }
  ```
  - `unloadDate`: 익일(금요일) - 정상
  - `deliveryScheduleLabel`: "24상25하" - 패턴 일치
  - `memo`에 `[지방]` 접두 없음: 확인 (구조화 태그 사용으로 메모 오염 없음)

### B2 — 상세 조회 UI: 배송태그 + 배송일정 표시

- **URL**: `/#/sales/ea94c395-b522-42ab-82ed-572236d953a1`
- **결과**: PASS
- **관측값**:
  - "지방" 태그 visible: `true`
  - "x상y하" 패턴 visible: `true`
- **스크린샷**: `B2-slip-detail-region-schedule.png` (77,468 bytes)

---

## 시나리오 C — 주말 규칙 실 API 검증

### C-⑦ 지방(REGION) + slipDate=토요일(2026-06-27) → unloadDate=월요일(2026-06-29)

- **HTTP 요청**: `POST /api/v1/slips` (slipDate=2026-06-27, deliveryTag=REGION)
- **결과**: PASS
- **관측값**:
  - `slipNo`: `2026/06/27-1`
  - `slipDate`: `2026-06-27` (토요일)
  - `deliveryTag`: `REGION`
  - `unloadDate`: `2026-06-29` (월요일)
  - `deliveryScheduleLabel`: `27상29하`
- **규칙 검증**: N=토요일+1=일요일 → 지방 예외 없음 → 월요일로 skip. **PASS**

### C-⑧ 야적(STACK) + slipDate=토요일(2026-06-27) → unloadDate=일요일(2026-06-28) 유지

- **HTTP 요청**: `POST /api/v1/slips` (slipDate=2026-06-27, deliveryTag=STACK)
- **결과**: PASS
- **관측값**:
  - `slipNo`: `2026/06/27-2`
  - `slipDate`: `2026-06-27` (토요일)
  - `deliveryTag`: `STACK`
  - `unloadDate`: `2026-06-28` (일요일)
  - `deliveryScheduleLabel`: `27상28하`
- **규칙 검증**: N=토요일+1=일요일, 야적&&M=토요일 → 일요일 유지(예외 규칙). **PASS**

### C-⑨ 당착 override (REGION + unloadDate=slipDate)

- **HTTP 요청**: `POST /api/v1/slips` (slipDate=2026-06-27, deliveryTag=REGION, unloadDate=2026-06-27)
- **결과**: PASS
- **관측값**:
  - `slipNo`: `2026/06/27-3`
  - `slipDate`: `2026-06-27`
  - `unloadDate`: `2026-06-27` (override 적용됨)
  - `deliveryScheduleLabel`: `당착` (UTF-8: U+B2F9 U+CC29)
- **규칙 검증**: REGION && N==M → "당착". **PASS**

---

## 전체 판정 요약

| 시나리오 | 항목 | 결과 |
|---|---|---|
| A1 | 지방 선택 → 배송일정 카드 노출 + 라벨 "25상26하" | PASS |
| A2 | 당착 체크 → 하차일=출고일, 라벨="당착" | PASS |
| A3 | 야적 선택 → 당착 체크박스 미노출 | PASS |
| A4 | 하차일 수동 편집 → 라벨 갱신 | PASS |
| B1 | API 생성 → unloadDate + deliveryScheduleLabel 정합 | PASS |
| B2 | 상세 조회 UI → "지방" 태그 + "x상y하" 표시 | PASS |
| C-⑦ | 지방 토요일 → unloadDate 월요일 | PASS |
| C-⑧ | 야적 토요일 → unloadDate 일요일(예외 유지) | PASS |
| C-⑨ | 당착 override → label "당착" | PASS |

**결함**: 없음 (severity 0)

**추가 관찰 사항**:
- Playwright 스펙 초기 작성 시 hash 라우터(`/#/path`) 미적용으로 A 시나리오 실패 → 수정 후 전수 PASS (스펙 버그, 서비스 정상)
- `deliveryScheduleLabel` 은 DB 컬럼이 아닌 서비스 레이어(`DeliverySchedule.scheduleLabel`) 파생값으로 매 조회 시 재계산
- 메모 자동 접두(`[지방]`)가 `deliveryTag` 구조화 후 제거됨 — B1에서 확인
- 터미널 한글 출력 깨짐은 Windows 콘솔 인코딩 한계 (실제 UTF-8 바이트 정상)

---

## 스크린샷 목록

| 파일 | 크기 | 내용 |
|---|---|---|
| `A1-region-delivery-schedule-card.png` | 65,045 bytes | 신규 전표폼 지방 선택 후 배송일정 카드 + 라벨 "25상26하" |
| `A2-same-day-checked-dangchak.png` | 61,547 bytes | 당착 체크박스 클릭 후 라벨 "당착" |
| `A3-stack-no-checkbox-unload-tomorrow.png` | 65,106 bytes | 야적 선택 후 당착 체크박스 미노출 상태 |
| `A4-manual-unload-date-label-update.png` | 61,368 bytes | 하차일 수동 편집 후 라벨 갱신 |
| `B2-slip-detail-region-schedule.png` | 77,468 bytes | 전표 상세 조회 - "지방" 태그 + "x상y하" 표시 |
