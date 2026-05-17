## SP-08-6-3 매출 전표 soft delete — Designer 사이클 1

### 1. 디자인 spec 결정

#### 1-1. 컴포넌트 재사용 (SP-08-5-3 패턴 1:1 이식)

| 컴포넌트 | 출처 | SP-08-6-3 적용 |
|---|---|---|
| `<Modal size="sm">` | @samhan/design-system | 삭제 확인 modal shell (400px max) |
| `<Button variant="ghost">` | @samhan/design-system | 취소 CTA |
| `<Button variant="danger">` | @samhan/design-system | 삭제 CTA |
| `.danger-banner` | global.css L3444 (SP-08-5-3 등록) | 422 SHIPPED 차단 배너 + 409 충돌 배너 |
| `.danger-text` | global.css L3454 (SP-08-5-3 등록) | "삭제된 전표는 복구할 수 없습니다" |
| `.successBanner` | sales.module.css L993 | 삭제 성공 toast (3초 자동 dismiss) |
| `canDirectDeleteSales` boolean | session store role | 삭제 버튼 조건부 렌더 |

#### 1-2. 한국어 라벨 확정

| UI 요소 | 라벨 |
|---|---|
| 모달 제목 | 매출 전표 삭제 |
| 확인 문구 | 정말 삭제하시겠습니까? |
| 전표 식별 | 전표번호: {slipNo} / 거래처: {partnerName} |
| 경고 문구 | 삭제된 전표는 복구할 수 없습니다. |
| 422 SHIPPED 배너 제목 | 삭제 불가 |
| 422 배너 본문 | 출고 진행 중이거나 완료된 매출 전표는 삭제할 수 없습니다. |
| 409 배너 | 다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 시도해 주세요. |
| 409 reload 버튼 | 최신 내용 불러오기 |
| 취소 버튼 | 취소 |
| 삭제 버튼 | 삭제 |
| 성공 toast | 전표가 삭제되었습니다. ({slipNo}) |

#### 1-3. 권한 가드 — SALES_DELETE_ROLES

```
SALES_DELETE_ROLES = ['SALES', 'MANAGER', 'MASTER']
```

`canDirectDeleteSales` = mode === 'OUTBOUND' && role in SALES_DELETE_ROLES && status in ['SAVED', 'DRAFT']

INVENTORY / ACCOUNTANT / WAREHOUSE role → 삭제 버튼 완전 미렌더 (DOM 제거).
SP-08-5-3 `PURCHASE_DELETE_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER']` 와 별개 분리.

#### 1-4. 토큰 참조

| 역할 | 토큰 | hex fallback |
|---|---|---|
| danger-banner border | `--color-danger-300` | `#FCA5A5` |
| danger-banner background | `--color-danger-50` | `#FEF2F2` |
| danger-banner color | `--color-danger-800` | `#991B1B` |
| danger-text color | `--color-danger-700` | `#B91C1C` |
| success-banner border | `--state-success` | `#10b981` |
| success-banner background | `--state-success-bg` | `#d1fae5` |
| success-banner color | `--state-success-text` | `#065f46` |

모두 SP-08-5-3 에서 이미 등록된 토큰. 신규 등록 없음.

---

### 2. PNG 4장 spec (QA 협업)

HTML mock 4개 생성 완료.

| PNG | mock HTML | 검증 포인트 |
|---|---|---|
| `01-sales-delete-confirm-modal.png` | `mock-01-sales-delete-confirm-modal.html` | slipNo + 거래처 비즈니스 식별자 / UUID 미노출 / danger-text / 취소+삭제 버튼 |
| `02-sales-delete-shipped-banner.png` | `mock-02-sales-delete-shipped-banner.html` | .danger-banner 렌더 / 삭제 버튼 disabled / SHIPPED 한국어 메시지 |
| `03-sales-delete-success-redirect.png` | `mock-03-sales-delete-success-redirect.html` | .successBanner toast / 삭제된 slipNo 목록 미노출 |
| `04-sales-delete-permission-guard.png` | `mock-04-sales-delete-permission-guard.html` | INVENTORY role — 삭제 버튼 DOM 미존재 / 수정 버튼 DOM 미존재 |

QA 에이전트 캡처 지침: Edge DevTools > `Full Size Screenshot` (viewport 1280px).

---

### 3. 신규 design-system 변경 필요 여부

**없음.** SP-08-5-3 에서 `.danger-banner` / `.danger-text` / danger/warning/success 토큰 scale 이미 global.css 등록 완료. 본 슬라이스는 SlipDetailPage.tsx 에 아래만 추가:

- `salesDeleteOpen` / `setSalesDeleteOpen` state
- `salesDeleteShippedAlert` / `setSalesDeleteShippedAlert` state
- `salesDeleteConflict` / `setSalesDeleteConflict` state
- `deleteSalesSlipMutation` (useMutation)
- `canDirectDeleteSales` boolean
- `<Modal size="sm">` 삭제 확인 JSX 블록

CSS 클래스 신규 추가 없음.

---

### 4. SP-08-5-3 / SP-08-6-2 회고 누적

| 항목 | 선행 슬라이스 회고 | SP-08-6-3 적용 |
|---|---|---|
| D-1 (SP-08-5-3) | 422 alert() → .danger-banner Modal 내 렌더 | 422 SHIPPED → .danger-banner 동일 패턴 (alert 금지) |
| D-2 (SP-08-5-3) | `.error-banner` → `.danger-banner` 토큰 통일 | 신규 슬라이스 `.danger-banner` 직접 사용 |
| D-4 (SP-08-5-3) | `.danger-banner` color 800 vs 700 불일치 → 800 통일 | `--color-danger-800` 적용 확인 |
| SP-08-6-2 1-4 | `SALES_EDIT_ROLES` INVENTORY 미포함 | `SALES_DELETE_ROLES` 동일 범위 분리 |
| SP-08-6-2 1-5 | 409 reload button `variant="secondary"` | 동일 패턴 준수 |
| UUID 원칙 | UUID 화면 노출 금지 — slipNo/partnerName 비즈니스 식별자만 | modal 내 UUID 참조 X, slipNo 표시 |

---

**종합**: SP-08-5-3 modal 패턴 1:1 이식. design-system 토큰/컴포넌트 변경 없음. HTML mock 4장 생성 완료 — QA 캡처 후 PNG 확정.

**designer agent — 2026-05-18**
