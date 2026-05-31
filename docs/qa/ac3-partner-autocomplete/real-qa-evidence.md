# AC-3 거래처 자동완성 — 실 QA 증거 (PR #333)

실행일: 2026-05-31
브랜치: feat/ac-3-partner-autocomplete
판정: **PASS (2/2)**

---

## 구동 방식

- 렌더러: `npx vite src/renderer --host 127.0.0.1 --port 5179` (VITE_MOCK_MODE 미설정 → 실 gateway 모드)
- API base: `http://localhost:8080` (apiClient.ts 기본값, VITE_MOCK_MODE 미주입)
- JWT: `window.samhanAuth` addInitScript stub — 실 JWT (gateway `/api/v1/auth/login` dev_master/MASTER 계정으로 취득)
- Playwright: `PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5179`
- spec: `clients/desktop/playwright/ac-3-partner-autocomplete/ac3-real-qa-driver.spec.ts`

---

## 실 API 적중 증명

| 단계 | 메서드 | URL | HTTP | 결과 |
|---|---|---|---|---|
| 거래처 검색 (캡처1) | GET | `http://localhost:8080/admin/partners/search?q=서울&size=20` | 200 | 2건 반환 |
| 거래처 검색 (캡처2) | GET | `http://localhost:8080/admin/partners/search?q=서울&size=20` | 200 | 2건 반환 |
| 거래처 detail (캡처2) | GET | `http://localhost:8080/admin/partners/P-2026-0001` | 200 | 연락처/주소/대표자 반환 |

admin-service 실 시드: 총 20건 이상. "서울" prefix 2건.

---

## 단계별 검증 결과

### 단계 1 — 전표 작성 화면 진입 + 거래처 combobox 확인

- URL: `http://127.0.0.1:5179/#/sales/new`
- "새 출고전표" 화면 렌더 확인
- "거래처" label + `role=combobox` input 표시 확인 (timeout 20s 내)
- 실 gateway 연동 모드 (VITE_MOCK_MODE 미설정)
- JWT: dev_master / MASTER role / 실 토큰

### 단계 2 — "서울" 타이핑 → 실 거래처 후보 드롭다운 (캡처1)

- PartnerAutocomplete input 에 "서울" 입력
- `aria-expanded=true` 전환 확인
- `GET /admin/partners/search?q=서울&size=20` → HTTP 200 적중 확인 (실 gateway)
- listbox(`role=listbox`, `aria-label="거래처 목록"`) 노출 (드롭다운 화면에 visible)
- 후보 2건:
  - `(주)서울에어컨 · P-2026-0001 · 113-07-10031`
  - `(주)서울택배 · P0-6-C002 · 201-81-00002`
- "서울" 포함 후보 assertion 통과 (hasSeoul=true)
- 권한: HTTP 200 (403 없음 — MASTER role search 허용 확인)
- 캡처: `ui-01-partner-search.png` (75,148 bytes)

### 단계 3 — 후보 클릭 선택 → 거래처명 표시 (캡처2, 1단계)

- listbox 첫 번째 option 클릭 (`(주)서울에어컨`)
- input value = `(주)서울에어컨` 확인
- `aria-expanded=false` 확인 (드롭다운 닫힘)
- listbox 소멸 확인

### 단계 4 — 2단계 채움 — detail fetch → 연락처/주소/대표자 (캡처2, 2단계)

- `GET /admin/partners/P-2026-0001` → HTTP 200 (실 gateway)
- 거래처 연락처 (`data-testid="slip-form-customer-tel"`) = `02-1017-1041` 자동 채움
- 거래처 사업장 주소 (`data-testid="slip-form-customer-address"`) = `서울특별시 강남구 테헤란로 101번길 2` 자동 채움
- 거래처 대표자 (`data-testid="slip-form-customer-representative"`) = `홍길동` 자동 채움
- 모든 응답 HTTP 200 (403 없음 — MASTER role detail 허용 확인)
- 캡처: `ui-02-partner-selected.png` (67,665 bytes)

---

## 스크린샷 목록

| 파일 | 크기 | 설명 |
|---|---|---|
| `ui-01-partner-search.png` | 75,148 B | "서울" 입력 → 실 후보 2건 드롭다운 노출 (listbox visible) |
| `ui-02-partner-selected.png` | 67,665 B | (주)서울에어컨 선택 완료 + 연락처/주소/대표자 자동 채움 |

---

## 실 검색 후보 데이터 (admin/partners/search?q=서울)

```json
[
  { "partnerCode": "P-2026-0001", "name": "(주)서울에어컨", "bizNo": "113-07-10031", "phone": "02-1017-1041" },
  { "partnerCode": "P0-6-C002",   "name": "(주)서울택배",   "bizNo": "201-81-00002", "phone": null }
]
```

## 실 detail 데이터 (admin/partners/P-2026-0001)

```json
{
  "partnerCode": "P-2026-0001",
  "name": "(주)서울에어컨",
  "phone": "02-1017-1041",
  "address": "서울특별시 강남구 테헤란로 101번길 2",
  "representative": "홍길동"
}
```

---

## UUID 비공개 가드

- listbox 표시: `(주)서울에어컨 · P-2026-0001 · 113-07-10031` — UUID 없음, partnerCode+bizNo만 노출
- input 선택값: `(주)서울에어컨` (name만 표시, partnerCode/UUID 미노출)
- 연락처/주소/대표자 필드: 비즈니스 데이터만 표시

---

## 권한 검증

| endpoint | role | HTTP |
|---|---|---|
| GET /admin/partners/search?q=서울 | MASTER | 200 |
| GET /admin/partners/P-2026-0001 | MASTER | 200 |
