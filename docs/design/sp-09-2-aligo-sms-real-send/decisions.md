# SP-09-2 Aligo SMS 실 발송 — 디자인 Decisions Log
## 작성: Designer · 2026-05-18

---

## 1. 발송 이력 테이블 컬럼 구성 (D1)

> **2026-05-18 갱신 (Cycle 1 Designer fix)**: 목록은 배차일 단위 SEND_AUDIT 배치 요약 행. per-message 개별 이력 아님. 수신자별 결과는 상세보기 modal 에서 확인.

### 결정
발송 이력 리스트는 8컬럼 배치 요약 구조로 구성한다 (실제 `buildListColumns()` 기준).

| 컬럼 | 정렬 | 처리 |
|---|---|---|
| 배차일 | 좌 | `YYYY-MM-DD` · font-weight 500 |
| 발송시각 | 좌 | `YYYY-MM-DD HH:mm` · color-text-secondary · font-size 12px |
| 실행자 | 좌 | `maskCreatedBy()` 적용 |
| 성공 | 우 | Badge success — 건수. 0이면 count-zero (#9CA3AF) |
| 실패 | 우 | Badge danger — 건수. 0이면 count-zero |
| 발송금지 | 우 | Badge warning — 건수. 0이면 count-zero |
| 결과 | 가운데 | Badge: 성공 / 부분실패 / 실패 |
| 상세 | 가운데 | ghost Button "보기" → AuditDetailModal |

### 상세 Modal DataTable 컬럼 (detailColumns — per-message)
| 컬럼 | 정렬 | 처리 |
|---|---|---|
| 거래처코드 | 좌 | `partnerCode` |
| 수신번호 | 좌 | `010-****-XXXX` 마스킹 · monospace |
| 결과 | 가운데 | Badge: 성공 / 실패 / 발송금지 |
| 사유 | 좌 | `reason` · color-danger 실패 시 |

### 근거
- 실제 `DispatchSmsSendAuditPage.tsx` `buildListColumns()` + `detailColumns` 와 1:1 일치
- 목록은 배치 단위 집계 → 빠른 현황 파악; 수신자별 상세는 modal 클릭 후 확인
- 이카운트 참조 리스트 화면의 우측 정렬 Badge 패턴 일관

---

## 2. Badge 컬러 (D2)

### 결정
Aligo 발송 성공/실패 Badge 는 기존 design-system 토큰을 그대로 사용한다.

| 상태 | 배경 | 텍스트 | 테두리 | 토큰 기반 |
|---|---|---|---|---|
| 성공 (result_code = 1) | `#CCFBF1` | `#0F766E` | `#99F6E4` | `--color-success-*` teal 계열 |
| 실패 (result_code != 1) | `#FEE2E2` | `#B91C1C` | `#FECACA` | `--color-danger-*` |

작업 요구사항에서 명시된 `--color-success-500` (#2A9D8F teal) 은 NTS 발행의 `--color-nts-primary` (#0F6523) 와 시각 구분을 위해, SMS 성공은 teal 500 계열 `#0F766E` (success-700 상당)을 텍스트 색으로 사용한다. 배경은 `#CCFBF1` (success-100 상당).

### 근거
- Aligo SMS 성공 = 완료 상태 → success 토큰 적합
- NTS 발행 녹색 (#0F6523) 과 혼동 없이 teal 계열로 명확히 구분

---

## 3. 수신자 마스킹 처리 (D3)

### 결정
수신자 전화번호는 `010-****-XXXX` 형식으로 가운데 4자리를 마스킹한다.

```
표시 예: 010-****-1234
CSS: font-family: JetBrains Mono/Consolas monospace; letter-spacing: 0.02em; font-variant-numeric: tabular-nums;
```

마스킹은 BE API 응답 시점에 적용 (DB 원본 비저장 원칙) 또는 FE 렌더 시점 적용 양쪽 모두 허용.
UUID 비공개 원칙(feedback_uuid_no_user_visibility)과 동일 선상의 개인정보 보호 조치.

---

## 4. msg_id 표시 (D4)

### 결정
Aligo msg_id 는 monospace + `--color-text-secondary` (#6B7280) 로 처리한다.

```
font-family: 'JetBrains Mono', Consolas, monospace;
font-size: 12px;
color: #6B7280;
letter-spacing: 0.01em;
```

비즈니스 식별자(슬립번호 등)보다 시각적 우선순위를 낮춰, 운영자용 보조 정보임을 표현.

---

## 5. 상세 Modal 구성 (D5)

### 결정
row 클릭 시 Modal 을 사용한다 (별도 페이지 라우팅 불필요). 구성:

1. Modal header — msg_id + 발송 일시 부제목
2. 발송 정보 kv-grid (msg_id / 수신자 / 발송일시 / 결과Badge / result_code / 발송유형)
3. 전체 메시지 본문 — pre-wrap 텍스트 박스
4. Aligo 원응답 JSON (일부) — 다크 배경 코드 블록

실패 시: Modal header 를 `--color-danger-*` 계열로 교체, 실패 배너 최상단 삽입, 조치 안내 박스 추가.

### 근거
SP-09-1 confirm modal 패턴 재활용 (일관성). 전체 메시지 + JSON 원응답은 운영자 디버깅에 필수.

---

## 6. 실패 상세 — 조치 안내 박스 (D6)

### 결정
실패 상세 Modal 하단에 warning 토큰 계열 안내 박스를 배치한다.

```
배경: #FFFBEB (warning-50)
테두리: #FDE68A (warning-200)
텍스트: #78350F (warning-800)
```

result_code 별 조치 방법을 텍스트로 제공 (Aligo 공식 에러 코드표 기반).

---

## 7. 필터 패널 (D7)

### 결정
날짜 범위 + 결과 상태 필터는 상단 패널로 펼침/접힘 없이 항상 표시한다 (248건 등 대량 이력 조회 목적).

활성 필터는 태그(chip) 형태로 별도 행에 표시하며 개별 제거 가능.
필터 적용 후 건수를 "필터 결과 N 건 / 전체 M 건" 형식으로 표기.

---

## 8. design-system 영향 없음 (D8)

기존 Table / Badge / Modal 패턴을 그대로 활용.
신규 토큰 등록 없음. NTS 발행(SP-09-1) 에서 등록한 `--color-nts-*` 와 충돌 없음.

---

## 9. 미결 항목

| 항목 | 이관 사유 |
|---|---|
| 재발송 버튼 실제 구현 | 현재 목업 표시 전용. BE 재발송 API 설계 선결 |
| result_code 별 한국어 에러 메시지 매핑 테이블 | BE 상수화 필요 |
| 수신자 마스킹 레벨 설정 (관리자 권한 해제) | 권한 정책 결정 후 |
