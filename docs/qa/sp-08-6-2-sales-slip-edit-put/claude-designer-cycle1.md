## SP-08-6-2 매출 전표 수정 direct PUT — Designer 사이클 1

### 1. 디자인 spec 결정

#### 1-1. 컴포넌트 재사용 (SP-08-5-2 패턴 1:1 이식)

| 컴포넌트 | 출처 | SP-08-6-2 적용 |
|---|---|---|
| `<Modal size="xl">` | @samhan/design-system | 매출 전표 수정 modal shell |
| `<Button variant="primary">` | @samhan/design-system | 저장 CTA |
| `<Button variant="secondary">` | @samhan/design-system | 취소 |
| `<Input>` | @samhan/design-system | 거래처 / 비고 / 배송주소 |
| `.errorBanner` (sales.module.css) | SP-08-4-2 → SP-08-5-2 | 409 danger banner |
| `.successBanner` (sales.module.css) | SP-08-5-2 | reload success 3초 toast |
| `AuditOverlaySection` | @samhan/design-system | SLIP_EDIT timeline |
| `RoleGuard` / `canEdit` boolean | session store | 수정 버튼 조건부 렌더 |

#### 1-2. 신규 CSS 클래스 — `sales-edit-field` 분리

SP-08-5-2 D-C1-2 회고 반영: 매입 수정 필드 래퍼를 `driver-edit-field` 에서
`purchase-edit-field` 로 이미 분리 완료. 본 슬라이스에서 **`sales-edit-field`** 신규 분리.

- `.sales-edit-field` — 매출 전표 수정 폼 필드 래퍼 (label + input vertical 4px gap)
- `.sales-edit-field-grid` — 3-column grid (gap 14px)
- `.sales-edit-field-span2` — 비고 필드 col-span 2

모두 `sales.module.css` 에 추가. design-system 토큰 변경 없음.

#### 1-3. 한국어 라벨 확정

| 필드 | 라벨 | 비고 |
|---|---|---|
| 모달 제목 | 매출 전표 수정 | |
| 거래처 | 거래처 | |
| 전표일자 | 전표일자 | readonly (슬립번호 기준) |
| 출고창고 | 출고창고 | readonly |
| 담당자 | 담당자 | readonly |
| 배송주소 | 배송주소 | 편집 가능 |
| 비고 | 비고 | 편집 가능 |
| 라인 품목명 | 품목명 | |
| 라인 모델번호 | 모델번호 | |
| 라인 수량 | 수량 | |
| 라인 단가 | 단가 (원) | |
| 라인 소계 | 소계 | readonly 계산 |
| 합계 | 합 계 | |
| 저장 버튼 | 저장 | |
| 취소 버튼 | 취소 | |
| 409 배너 제목 | 다른 사용자가 먼저 수정했습니다. | |
| 409 배너 설명 | 최신 내용 불러오기 후 다시 저장해 주세요. | |
| 409 reload 버튼 | 최신 내용 불러오기 | |
| audit 라벨 | 수정 이력 | |

#### 1-4. 권한 가드

```
SALES_EDIT_ROLES = ['SALES', 'MANAGER', 'MASTER']
```
`canEdit` = false 시 수정 버튼 미렌더 (INVENTORY / ACCOUNTANT 포함).
SP-08-5-2 `PURCHASE_EDIT_ROLES = ['WAREHOUSE','MANAGER','MASTER']` 와 별개 분리.

#### 1-5. 409 / 422 banner 토큰

- 409: `--color-danger-bg` / `--color-danger-300` / `--color-danger-800` (SP-08-5-3 등록 토큰 그대로)
- 422 inspection 차단: 이번 슬라이스 범위 외 (FE 구현 시 `.warningBanner` 패턴 준용)
- reload success: `--state-success-bg` / `--state-success` / `--state-success-text` (sales.module.css `.successBanner`)

---

### 2. PNG 4장 spec (QA 협업)

HTML mock 4개 생성 완료.

| PNG | mock HTML | 검증 포인트 |
|---|---|---|
| `01-sales-edit-form.png` | `mock-01-sales-edit-form.html` | 거래처/라인테이블/합계 + 저장/취소 버튼 |
| `02-sales-edit-conflict-banner.png` | `mock-02-sales-edit-conflict-banner.html` | 409 danger banner + "최신 내용 불러오기" CTA + 저장 비활성 |
| `03-sales-edit-audit-timeline.png` | `mock-03-sales-edit-audit-timeline.html` | SLIP_EDIT chip + actorName (UUID 미노출) + rev 번호 |
| `04-sales-edit-role-guard.png` | `mock-04-sales-edit-role-guard.html` | INVENTORY 역할 — 수정 버튼 미렌더, 읽기 전용 상세 조회 유지 |

QA 에이전트 캡처 지침: Edge DevTools > `Full Size Screenshot` (viewport 1280px).

---

### 3. 신규 design-system 변경 필요 여부

**없음.** SP-08-5-3 에서 danger/warning/success 토큰 scale 이미 등록 완료.
본 슬라이스는 CSS 클래스 (`sales-edit-field*`) 3개만 `sales.module.css` 에 추가.

---

### 4. SP-08-5-2 회고 누적

| 항목 | SP-08-5-2 회고 | SP-08-6-2 적용 |
|---|---|---|
| D-C1-2 | `driver-edit-field` → `purchase-edit-field` 분리 | `sales-edit-field` 동일 패턴 신규 분리 |
| D-C1-3 | inline style `textAlign/whiteSpace` → `.tdRight`/`.tdNoWrap` | 동일 패턴 준수 |
| D-C1-1 | warning/danger token scale 등록 | 등록 토큰 그대로 재사용 |
| cycle2 Nit | PNG 02 UUID 주석 → spec 명시 | mock HTML 주석에 "QA 검증 주석" 명시 |
| cycle2 Nit | `--color-success-DEFAULT` CSS alias 부재 | 본 슬라이스 미해당 (success DEFAULT 미사용) |

---

**종합**: SP-08-5-2 패턴 1:1 이식. `sales-edit-field` CSS 클래스 3개 신규 분리, 디자인 시스템 토큰 변경 없음. HTML mock 4장 생성 완료 — QA 캡처 후 PNG 확정.

**designer agent — 2026-05-18**
