# AC-2 품목 자동완성 — 실 QA 증거 (PR #332)

실행일: 2026-05-31
브랜치: feat/ac-2-product-autocomplete
판정: **PASS (2/2)**

---

## 구동 방식

- 렌더러: `npx vite src/renderer --host 127.0.0.1 --port 5179` (VITE_MOCK_MODE 미설정 → 실 gateway 모드)
- API base: `http://localhost:8080` (apiClient.ts 기본값, VITE_MOCK_MODE 미주입)
- JWT: `window.samhanAuth` addInitScript stub — 실 JWT (gateway `/api/v1/auth/login` dev_master 계정으로 취득)
- Playwright: `PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5179`
- spec: `clients/desktop/playwright/ac-2-product-autocomplete/ac2-real-qa-driver.spec.ts`

---

## 실 API 적중 증명

| 단계 | 메서드 | URL | HTTP | 결과 |
|---|---|---|---|---|
| 품목 검색 (캡처1) | GET | `http://localhost:8080/api/products?q=AR05&size=20` | 200 | 3건 반환 |
| 품목 검색 (캡처2) | GET | `http://localhost:8080/api/products?q=AR05&size=20` | 200 | 3건 반환 |

product-service 실 시드: 총 100건 (totalElements), AR05 prefix 3건.

---

## 단계별 검증 결과

### 단계 1 — 전표 작성 화면 진입 + 품목 combobox 확인

- URL: `http://127.0.0.1:5179/#/sales/new`
- "+ 라인 추가" 버튼 표시 확인 (timeout 20s 내)
- 라인 1 품목 입력(`role=combobox`, `ariaLabel="라인 1 품목"`) 표시 확인
- 실 gateway 연동 모드 (VITE_MOCK_MODE 미설정)

### 단계 2 — "AR05" 타이핑 → 실 품목 후보 드롭다운

- ProductAutocomplete input 에 "AR05" 입력
- `aria-expanded=true` 전환 확인
- `GET /api/products?q=AR05&size=20` → HTTP 200 적중 확인 (실 gateway)
- listbox(`role=listbox`, `aria-label="품목 목록"`) 노출
- 후보 3건:
  - `AR05TXEAAWKNEU-01 · 삼성 윈드프리 5평형`
  - `AR05TXEAAWKNEU-11 · 삼성 윈드프리 5평형`
  - `AR05TXEAAWKNEU-21 · 삼성 윈드프리 5평형`
- AR05 후보 포함 assertion 통과 (hasAr05=true)
- 캡처: `ui-01-product-search.png` (63,784 bytes)

### 단계 3 — 후보 클릭 선택 → modelName 표시 + 단가 자동 채움

- listbox 첫 번째 option 클릭 (`AR05TXEAAWKNEU-01 · 삼성 윈드프리 5평형`)
- input value = `AR05TXEAAWKNEU-01` (UUID 비공개 유지, modelName 만 표시)
- `aria-expanded=false` 확인 (드롭다운 닫힘)
- listbox 소멸 확인
- 단가 입력란(`aria-label="라인 1 단가"`) value = `600,000` (sellingPrice=600000 자동 채움)
- priceNum = 600000 > 0 assertion 통과
- 캡처: `ui-02-product-selected.png` (66,358 bytes)

---

## 스크린샷 목록

| 파일 | 크기 | 설명 |
|---|---|---|
| `ui-01-product-search.png` | 63,784 B | "AR05" 입력 → 실 후보 3건 드롭다운 노출 |
| `ui-02-product-selected.png` | 66,358 B | AR05TXEAAWKNEU-01 선택 완료 + 단가 600,000 자동 채움 |

---

## 실 검색 후보 데이터 (api/products?q=AR05)

```json
[
  { "modelName": "AR05TXEAAWKNEU-01", "name": "삼성 윈드프리 5평형", "sellingPrice": 600000 },
  { "modelName": "AR05TXEAAWKNEU-11", "name": "삼성 윈드프리 5평형", "sellingPrice": 600000 },
  { "modelName": "AR05TXEAAWKNEU-21", "name": "삼성 윈드프리 5평형", "sellingPrice": 600000 }
]
```

---

## 품목 시드 현황 (사전 확인)

- 검색어 "AJ" (spec 원래 계획) → 0건 (시드에 AJ 품목 없음)
- 검색어 빈값 → totalElements=100 (전체 품목 존재 확인)
- 검색어 "AR05" → 3건 (실 사용 검색어로 조정)
- 품목 모델명 패턴: AR05~AR20 + TX/DX/NX/PX variant (삼성/LG 에어컨 계열)
