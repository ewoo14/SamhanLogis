# SP-05 Samhan Public CRUD 표면 재점검 설계

> 작성일: 2026-05-16
> 브랜치: `codex/sp-05-samhan-public-crud-audit`
> 전제: SP-04 머지 후 Samhan Public 전메뉴는 legacy GAS/Notion 이식 계약까지 1차 감사 완료. 본 슬라이스는 실제 사용자가 메뉴에서 생성/상세/수정/검수/export 흐름을 찾을 수 있는지 확인한다.

## 문제

판매관리와 구매관리는 더 이상 단순 조회 화면이 아니다. `/sales/new`, `/purchases/new`, `/sales/:id`, `/purchases/:id`가 존재하고 상세 화면에서 수정/상태 전이가 이어지지만, 통합 목록에서는 행 클릭이 다중 선택으로 쓰여 상세 진입이 명확하지 않았다.

또한 이전 inventory 문서에는 PR #203~#205로 이미 해소된 거래처 기본 UI와 구매관리 검수 CTA가 여전히 “UI 부재”로 남아 있어 다음 슬라이스 우선순위 판단을 흐릴 수 있었다.

## 목표

| 항목 | 목표 |
| --- | --- |
| 판매관리 | 목록 행에서 공개 판매번호 기반 `상세` 버튼을 제공하고 `/sales/:id`로 이동한다. |
| 구매관리 | 목록 행에서 공개 구매번호 기반 `상세` 버튼을 제공하고 `/purchases/:id`로 이동한다. |
| UUID 비공개 | 버튼 test id와 화면 텍스트는 `slipNo` 기반 public id만 사용한다. 내부 `row.id`는 route/API param으로만 사용한다. |
| 문서 정정 | 거래처 기본 생성 UI와 구매관리 검수 CTA의 현재 구현 상태를 inventory/catalog에 우선 반영한다. |
| QA | PR 본문에 여러 장의 상세 캡처를 인라인 첨부할 수 있도록 SP-05 전용 캡처와 체크리스트를 생성한다. |

## 비목표

- 삭제 버튼을 새로 만들지 않는다. 전표 삭제/취소는 도메인 상태 전이와 soft-delete 정책이 맞물리므로 별도 결정이 필요하다.
- 거래처 4탭의 모든 이카운트 고급 필드를 이번 PR에서 구현하지 않는다. 기본 생성/수정 UI는 운영 가능 상태로 정정하고, 여신/단가·부가정보 확장은 후속으로 남긴다.
- 품목 7탭 UI는 다음 후보(SP-06 또는 별도 P0)로 분리한다.

## 수용 기준

1. `clients/desktop/playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts`가 RED 후 GREEN으로 통과한다.
2. `clients/desktop` typecheck/lint/build가 통과한다.
3. 판매/구매 관리 관련 기존 Playwright 스펙의 컬럼 계약이 `상세` 열을 포함하도록 갱신된다.
4. `frontend-feature-inventory.md`와 `missing-features-catalog.md`가 SP-05 현재 상태 블록을 포함한다.
5. QA 캡처는 판매관리, 구매관리, 거래처 관리, 검수 CTA, 문서/계약 매트릭스를 여러 장으로 분리한다.
