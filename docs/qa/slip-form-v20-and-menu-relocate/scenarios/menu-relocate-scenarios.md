# admin GAS 이식 메뉴 일반 카테고리 노출 시나리오

**슬라이스**: `feature/slip-form-v20-and-menu-relocate`
**작성일**: 2026-05-11
**작성자**: QA agent
**연관 Playwright spec**: `clients/desktop/playwright/menu-relocate/menu-relocate.spec.ts`

---

## 배경

기존 admin 전용 GAS(Google Apps Script) 이식 메뉴 항목들이 각 업무 카테고리로 분산 배치되는 작업이다. 기존에는 관리자 전용 섹션에만 노출되던 다음 4개 메뉴가 일반 카테고리로 이동한다.

| 메뉴 항목 | 이전 위치 | 이후 위치 (카테고리) | 허용 역할 |
|-----------|-----------|----------------------|-----------|
| 지역 관리 | 관리자 메뉴 | 배차(arologis) | DISPATCH / MANAGER / MASTER |
| 알리고 주소록 | 관리자 메뉴 | 메신저 | MANAGER / MASTER |
| 발송금지 거래처 | 관리자 메뉴 | 영업 | SALES / MANAGER / MASTER |
| 시트 동기화 | 관리자 메뉴 | 설정/앱정보 | MANAGER / MASTER |

---

## 사전 조건

| 항목 | 값 |
|------|-----|
| 테스트 URL | `http://localhost:5173` |
| ROLE 변경 방법 | URL query param `?mockRole=<ROLE>` |
| Mock 모드 | VITE_MOCK_MODE=1 |
| 사이드바 | AppLayout 사이드바 (folded/expanded 상태 모두 테스트) |

---

## TC-M1: 배차(arologis) 카테고리 — "지역 관리" 항목 DISPATCH/MANAGER/MASTER 접근 가능

**목적**: "지역 관리" 메뉴가 배차(arologis) 카테고리 하위로 이동되고, DISPATCH/MANAGER/MASTER 역할에서 visible 임을 확인한다.

**절차**:
1. `/?mockRole=DISPATCH` 접속 → 사이드바 "배차" 카테고리 펼치기 → "지역 관리" visible 확인
2. `/?mockRole=MANAGER` 접속 → 동일 확인
3. `/?mockRole=MASTER` 접속 → 동일 확인

**음성 케이스**:
- `/?mockRole=SALES` 접속 → "지역 관리" 미표시 (SALES 는 배차 접근 불가)

**기대 결과**:
- DISPATCH / MANAGER / MASTER 3개 역할 모두에서 "지역 관리" visible
- SALES 역할에서는 미표시 (또는 카테고리 자체 숨김)
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-m1-dispatch-region-manage.png`

---

## TC-M2: 메신저 카테고리 — "알리고 주소록" 항목 MANAGER/MASTER 접근 가능

**목적**: "알리고 주소록" 메뉴가 메신저 카테고리 하위로 이동되고, MANAGER/MASTER 역할에서 visible 임을 확인한다.

**절차**:
1. `/?mockRole=MANAGER` 접속 → 사이드바 "메신저" 카테고리 펼치기 → "알리고 주소록" visible 확인
2. `/?mockRole=MASTER` 접속 → 동일 확인
3. `/?mockRole=SALES` 접속 → "알리고 주소록" 미표시 확인 (음성 케이스)

**기대 결과**:
- MANAGER / MASTER 2개 역할에서 "알리고 주소록" visible
- SALES 역할에서는 미표시
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-m2-messenger-aligo-addressbook.png`

---

## TC-M3: 영업 카테고리 — "발송금지 거래처" 항목 SALES/MANAGER/MASTER 접근 가능

**목적**: "발송금지 거래처" 메뉴가 영업 카테고리 하위로 이동되고, SALES/MANAGER/MASTER 역할에서 visible 임을 확인한다.

**절차**:
1. `/?mockRole=SALES` 접속 → 사이드바 "영업" 카테고리 펼치기 → "발송금지 거래처" visible 확인
2. `/?mockRole=MANAGER` 접속 → 동일 확인
3. `/?mockRole=MASTER` 접속 → 동일 확인

**기대 결과**:
- SALES / MANAGER / MASTER 3개 역할 모두에서 "발송금지 거래처" visible
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-m3-sales-block-partner.png`

---

## TC-M4: 설정/앱정보 카테고리 — "시트 동기화" 항목 MANAGER/MASTER 접근 가능

**목적**: "시트 동기화" 메뉴가 설정/앱정보 카테고리 하위로 이동되고, MANAGER/MASTER 역할에서 visible 임을 확인한다.

**절차**:
1. `/?mockRole=MANAGER` 접속 → 사이드바 "설정/앱정보" 카테고리 펼치기 → "시트 동기화" visible 확인
2. `/?mockRole=MASTER` 접속 → 동일 확인

**기대 결과**:
- MANAGER / MASTER 2개 역할에서 "시트 동기화" visible
- SALES / DISPATCH 역할에서는 미표시
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-m4-settings-sheet-sync.png`

---

## TC-M5: 기존 마스터 메뉴 4개 regression 가드

**목적**: admin GAS 이식 메뉴 작업 후 기존 마스터 전용 관리 메뉴 4개가 삭제되지 않고 유지되는지 확인한다 (regression 가드).

**검증 대상 메뉴**:

| 메뉴 항목 | 경로 |
|-----------|------|
| 지역 관리 (기존 마스터 위치) | `/admin/regions` |
| 사용자 관리 | `/admin/users` |
| 거래처 관리 | `/admin/partners` |
| 제품 관리 | `/admin/products` |

**절차**:
1. `/?mockRole=MASTER` 접속
2. 사이드바에서 위 4개 경로를 가진 링크 또는 메뉴 항목 탐색
3. 각 메뉴의 href 또는 텍스트 기반 존재 여부 확인

**기대 결과**:
- 4개 기존 마스터 메뉴가 모두 사이드바에 존재 (href 또는 텍스트 기준)
- 메뉴 이식 작업으로 기존 마스터 전용 메뉴가 삭제되지 않음
- `pageerror` 0건

**스크린샷**: `docs/qa/slip-form-v20-and-menu-relocate/tc-m5-master-menu-regression.png`

---

## 역할별 메뉴 접근 매트릭스 요약

| 메뉴 항목 | DISPATCH | SALES | MANAGER | MASTER |
|-----------|----------|-------|---------|--------|
| 지역 관리 (배차) | O | X | O | O |
| 알리고 주소록 (메신저) | X | X | O | O |
| 발송금지 거래처 (영업) | X | O | O | O |
| 시트 동기화 (설정) | X | X | O | O |

O = visible, X = 미표시
