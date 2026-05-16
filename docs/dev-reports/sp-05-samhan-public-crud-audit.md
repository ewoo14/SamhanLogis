# SP-05 Samhan Public CRUD 표면 재점검

> 작성일: 2026-05-16
> 브랜치: `codex/sp-05-samhan-public-crud-audit`
> 목적: Samhan Public 전메뉴 감사 다음 단계로, 실제 운영자가 판매/구매/거래처 관리 화면에서 생성과 상세/수정/검수 흐름을 자연스럽게 찾을 수 있는지 보정한다.

## 1. 결론

| 영역 | 처리 |
| --- | --- |
| 판매관리 | 목록 테이블과 Excel-like DataGrid에 `상세` 액션을 추가했다. 버튼은 `/sales/:id`로 이동하며 test id는 판매번호(`slipNo`) 기반이다. |
| 구매관리 | 목록 테이블과 DataGrid에 `상세` 액션을 추가했다. 기존 검수 CTA와 공존하며 `/purchases/:id`로 이동한다. |
| UUID 비공개 | `row.id`는 route param으로만 사용한다. 화면 텍스트/aria/test id에는 `YYYY/MM/DD-{순번}` 공개 업무번호를 사용한다. |
| 문서 정정 | 거래처 기본 UI와 구매관리 검수 CTA를 “UI 부재”로 남기지 않도록 inventory/catalog에 SP-05 우선 적용 블록을 추가했다. |

## 2. 변경 파일

| 파일 | 내용 |
| --- | --- |
| `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx` | `toPublicTestId`, 상세 버튼, 18번째 컬럼, DataGrid 상세 action |
| `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx` | 상세 버튼, 12번째 기본 컬럼, 검수 포함 시 13컬럼, DataGrid 상세 action |
| `clients/desktop/playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts` | dev server 없이 실행되는 CRUD surface 정적 계약 |
| `clients/desktop/playwright/sales-purchase-query/*.spec.ts` | 기존 UI 컬럼 기대값을 판매 18 / 구매 12로 갱신 |
| `docs/manual/inventory/*.md` | 거래처 기본 UI와 입고 검수 CTA 현재 상태 정정 |

## 3. 권한/데이터 흐름

- 판매/구매 목록 자체는 기존처럼 인증 사용자에게 노출된다.
- 신규 작성 버튼은 기존 `canCreateSlip(role)` 조건을 유지한다.
- 상세 버튼은 목록 조회 가능 사용자에게 노출된다. 상세 화면의 저장/전이 버튼은 기존 `SlipDetailPage` 권한 정책을 따른다.
- 내부 UUID는 URL param으로 쓰이지만 UI에 렌더링하거나 QA 캡처에 표시하지 않는다.

## 4. 테스트 전략

| 단계 | 검증 |
| --- | --- |
| RED | `sp-05-crud-surface.spec.ts`를 먼저 작성하고 판매/구매 상세 버튼 및 문서 현재 상태 누락으로 실패 확인 |
| GREEN | 판매/구매 상세 액션과 문서 정정 후 동일 스펙 통과 |
| 회귀 | typecheck/lint/build, full-menu contract, 기존 sales/purchase query UI 스펙 |
| QA | SP-05 전용 PNG 여러 장과 screenshot checklist |

## 5. 검증 결과

| 검증 | 결과 |
| --- | --- |
| `npx playwright test playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts --reporter=line` | PASS — 3 tests, skipped 0. RED 실패 확인 후 GREEN 통과 |
| `npx playwright test playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` | PASS — 14 tests, skipped 0 |
| `AUDIT_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_SKIP_UI=0 npx playwright test playwright/sales-purchase-query/*.spec.ts --reporter=line` | PASS — 9 tests, skipped 0. Vite root는 `src/renderer`, route는 HashRouter `/#/...`로 정정 |
| `npm run typecheck` (`clients/desktop`) | PASS |
| `npm run lint` (`clients/desktop`) | PASS — 기존 warning 2건, error 0 |
| `npm run build` (`clients/desktop`) | PASS |
| `git diff --check` | PASS — CRLF 안내 warning만 출력 |
| `node scripts/generate-sp-05-crud-audit-screenshots.mjs` | PASS — QA PNG 8장 생성, 모두 non-zero |

## 6. 5-agent 리뷰 반영

| 역할 | 확인/반영 |
| --- | --- |
| Backend | 판매/구매 상세 진입은 내부 UUID를 route param으로만 사용하고 공개 업무번호는 `YYYY/MM/DD-{순번}` test id/aria로만 노출되도록 확인했다. |
| Frontend | `/sales`, `/purchases`, `/transfers`, `/warehouses`의 관리형 라벨과 `/admin/partners`, `/admin/partners/new` 직접 진입 계약을 full-menu contract와 SP-05 contract로 재확인했다. |
| Designer | Dashboard 빠른 액션과 AdminLayout 라벨이 `판매관리`, `구매관리`, `재고이동 관리`, `창고 관리`, `거래처 DC 설정` 기준을 따르는지 재점검했다. |
| DevOps | PR 캡처는 `docs/qa/<slice>/screenshots/*.png`와 실제 Vite mock UI 캡처를 함께 첨부하고, PR 본문에서는 최종 commit SHA raw URL로 고정한다. |
| QA | static contract 14건과 Vite mock UI 9건을 skip 없이 실행하는 것을 PR 게이트로 둔다. |
| TM | `/admin/sheet-sync`, `/admin/blocked-partners`, `/admin/aligo-address-book`은 AdminLayout 하위가 아닌 standalone guarded route 계약으로 유지한다. |

## 7. 후속 후보

| 후보 | 이유 |
| --- | --- |
| SP-06 legacy GAS 기능 완전 대조 | SP-04에서 기능 mapping은 정리했으나, 각 GAS 함수별 운영 UI/스모크까지 더 세밀히 추적 가능 |
| SP-07 Google Sheets 견적/주문 E2E | 종합견적서/주문서 원본 tab 재검증 이후 실제 생성→전표 변환 E2E 확인 필요 |
| SP-08 권한/UUID 전메뉴 회귀 | 메뉴/role/비노출 계약이 계속 늘어나는 중이라 dedicated 회귀 세트 필요 |
