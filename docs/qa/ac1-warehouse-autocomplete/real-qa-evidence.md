# AC-1 창고 자동완성 — 실 QA 증거 (PR #331)

실행일: 2026-05-31  
브랜치: feat/ac-1-warehouse-autocomplete  
판정: **PASS (3/3)**

---

## 구동 방식

- 렌더러: `npx vite src/renderer --host 127.0.0.1 --port 5179` (VITE_MOCK_MODE 미설정 → 실 gateway 모드)
- API base: `http://localhost:8080` (apiClient.ts 기본값, VITE_API_BASE_URL 미주입)
- JWT: `window.samhanAuth` addInitScript stub — 실 JWT (gateway `/api/v1/auth/login` dev_master 계정으로 취득)
- Playwright: `PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5179`
- spec: `clients/desktop/playwright/ac1-warehouse-autocomplete-real-qa/ac1-warehouse-autocomplete-real-qa.spec.ts`

---

## 실 API 적중 증명

| 단계 | 메서드 | URL | HTTP |
|---|---|---|---|
| 창고 목록 | GET | `http://localhost:8080/inventory/warehouses` | 200 |
| 주문 상세 | GET | `http://localhost:8080/api/v1/partner-orders/8c976ad1-…` | 200 |
| 전환 제출 | POST | `http://localhost:8080/api/v1/partner-orders/8c976ad1-…/convert-to-slip` | 200 |

---

## 단계별 검증 결과

### 단계 1 — "본사" 타이핑 → HQ-001 후보 드롭다운

- autocomplete input(`role=combobox`)에 "본사" 입력
- `aria-expanded=true` 전환 확인
- listbox(`role=listbox`) 노출, 첫 번째 option: `HQ-001 / 본사창고`
- 캡처: `ui-01-autocomplete-suggestions.png` (94,534 bytes)

### 단계 2 — HQ-001 클릭 선택 → "HQ-001 · 본사창고" + 제출 활성

- listbox 첫 번째 option onMouseDown → pick() 호출
- input value = `HQ-001 · 본사창고` (UUID 비공개 유지, 코드·이름만 노출)
- `aria-expanded=false` 확인 (드롭다운 닫힘)
- 제출 버튼(`partner-order-convert-submit`) enabled=true 확인
- 캡처: `ui-02-selected.png` (95,089 bytes)

### 단계 3 — "출고전표로 전환" 제출 → 실 slipNo 토스트

- POST convert-to-slip HTTP 200
- 응답 body: `{"slipNo":"2026/05/31-7","orderStatus":"DRAFT","fullyConverted":false}`
- 토스트 문구: `출고전표 2026/05/31-7 발행 — 잔여 수량이 남아 있습니다`
- 실 slipNo: **2026/05/31-7**
- 캡처: `ui-03-convert-success.png` (83,621 bytes)

---

## 스크린샷 목록

| 파일 | 크기 | 설명 |
|---|---|---|
| `ui-01-autocomplete-suggestions.png` | 94,534 B | "본사" 입력 → HQ-001 후보 드롭다운 노출 |
| `ui-02-selected.png` | 95,089 B | HQ-001 선택 완료 + 수량 입력 + 제출 버튼 활성 |
| `ui-03-convert-success.png` | 83,621 B | 전환 성공 토스트 — slipNo 2026/05/31-7 발행 |
