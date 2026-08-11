# #883 S4 주문서·견적서 design-system 표준화 보고서

작성일: 2026-08-12  
대상 브랜치: `feat/883-s4-order-ds-migration`  
기준: `origin/main f73be2670`  
범위: 데스크톱 주문서·견적서. 모바일과 인쇄 구현은 제외.

## 1. 정정 반영

개발책임자 정정에 따라 주된 표적을 색/배지 치환에서 상세 화면 셸 전환으로 좁혔다.

| 항목 | 전환 전 | 전환 후 |
|---|---|---|
| 주문 상세 최상위 | `salesScope` → `wrap` 레거시 estimate 셸 | `SalesSubNav` 뒤 공통 상세 흐름, `Card` 기반 |
| 주문 기본 정보 | 로컬 `card`/`cardHead`/`formGrid`, 읽기 전용 `Input` | `Card` + `detail-grid` + `detail-label/detail-value` |
| 빈 값 | 필드별 조건부 생략 또는 `-` | `detail-grid-item-empty` 규약을 필드 단위로 적용 |
| 문서 식별자 | 로컬 텍스트 | `OrderNumberDisplay`, 원문 문자열 불변 |
| 상태 | 주문 상세 로컬 배지/색상 | `OrderStatusBadge`, 상태 코드·라벨 1:1 유지 |
| 액션 위치 | 레거시 `topActions` | 공통 `detail-action-bar` |
| 견적 상세 | `Card`는 있었지만 메타데이터가 일반 div | 같은 `Card` 안 `detail-grid`로 필드 배치 통일 |
| 고유 기능 | 협업·재고 조회·라인 참조·전환 모달 | 모두 유지, 새 셸 내부에 배치 |

주문 라인 체크박스/전체 선택, 재고 조회, 참조 조회, 구성품 표시, 협업 패널, 수정/전환/삭제 모달과 `handlePrint` 구현은 삭제하거나 업무 로직을 변경하지 않았다.

## 2. 전표 도메인 DS 정찰과 적용

기준 상세인 `SlipDetailPage`가 제공받는 축은 `AuditOverlay`, `Badge`, `Button`, `Card`, `CopyButton`, `Input`, `Modal`, `PartnerAutocomplete`, `PhoneInput`, `ProductAutocomplete`, `ProgressBar`, `SignatureViewer`, `SlipEditRequestDialog`, `SlipNumberDisplay`, `Spinner`이다. `TransferDetailPage`는 `Badge`, `Button`, `Card`, `DataTable`과 전역 `detail-grid`를 사용한다.

주문 도메인에는 기존 대응 컴포넌트가 없었으므로 승인된 두 컴포넌트만 신설했다.

- `OrderStatusBadge`: partner-order 상태 코드 6종과 한국어 라벨을 단일 매핑으로 관리한다.
- `OrderNumberDisplay`: 주문번호 업무 문자열을 변경하지 않고 표시하며 UUID prop을 받지 않는다.
- 주문 상세에는 위 두 컴포넌트 외에 `Card`, `CopyButton`, `Spinner`를 전표 상세 패턴대로 재사용했다.
- 주문 목록·견적 목록은 기존 `DataTable` 사용을 유지했다.

### 상태 라벨 대조

| 코드 | 기존 라벨 | DS 표현 |
|---|---|---|
| `DRAFT` | 진행중 | `OrderStatusBadge` — 진행중 |
| `ON_HOLD` | 보류 | `OrderStatusBadge` — 보류 |
| `CONFIRMING` | 확인중 | `OrderStatusBadge` — 확인중 |
| `CONFIRMED` | 완료 | `OrderStatusBadge` — 완료 |
| `CANCELED` | 취소 | `OrderStatusBadge` — 취소 |
| `CONVERTED` | 전환완료 | `OrderStatusBadge` — 전환완료 |

견적 상태는 주문 상태 union과 업무 의미가 다르다. 따라서 임의로 `OrderStatusBadge`에 합치지 않고 기존 DS `Badge`의 variant 표현을 유지했다.

| 견적 코드 | 기존 라벨 | DS 표현 |
|---|---|---|
| `QUOTE_DRAFT` | 작성중 | `Badge neutral` |
| `QUOTE_SENT` | 발송완료 | `Badge brand` |
| `QUOTE_ACCEPTED` | 수주완료 | `Badge success` |
| `QUOTE_REJECTED` | 거절 | `Badge danger` |
| `QUOTE_CONVERTED` | 전표변환완료 | `Badge warning` |

## 3. 토큰 전환 근거

DS token 원값은 `tokens.css` 기준이다. 승인된 두 visible change는 의도된 변경으로 기록한다.

| 레거시 어휘 | 전환 전 값 | DS 대응 | 전환 후 값 | 판정 |
|---|---:|---|---:|---|
| `--c-bg` | `#fff` | `--surface-card` | `#FFFFFF` | 의미·값 대응 |
| `--c-line` | `#000` | `--line-default` | `#E1E5EA` | 순검정 선을 DS 표준선으로 변경 |
| `--c-accent` | `#2563eb` | `--action-brand` | `#1E40AF` | 자체 파랑을 DS 액션색으로 변경 |
| `--c-muted` | 레거시 보조색 | `--ink-secondary` | `#5C6773` | 보조 텍스트 |
| `--c-strong` | 레거시 강조색 | `--ink-primary` | `#1A1F2E` | 기본 텍스트 |

`sales.module.css`와 판매 라우트에서 `--c-line`, `--c-bg`, `--c-accent`, `--c-muted`, `--c-strong` 사용은 제거했다. `--c-line/#000`과 `--c-accent/#2563eb`의 화면 색 변화는 이번 표준화의 승인된 결과다.

## 4. sales.module.css 사용 판정

정적 분석은 TS/TSX 소스의 CSS module 사용을 기준으로 수행했다.

| 시점 | 줄 수 | class selector | 사용 | 죽음 |
|---|---:|---:|---:|---:|
| 전환 전 정찰 | 1,194 | 100 | 56 | 44 |
| 상세 셸 전환 및 정리 후 | 513 | 41 | 41 | 0 |

죽은 44개는 이동하지 않았다. 추가로 상세 셸을 DS로 옮기면서 새로 죽은 `cardActions`, `cardHead`, `cardTitle`, `formFieldSpanAll`, `listBackLink`, `ratio`도 제거했다. 인쇄/미리보기용 구현 CSS와 해당 동작은 이 파일에서 재구현하지 않았다.

## 5. 불변식 확인

- 주문 40% 규칙, 견적 7% 및 종합견적서 custom 동작을 계산/저장 코드에서 변경하지 않았다.
- 금액·수량·상태 라벨·날짜·주문번호/견적번호를 포맷 변경하지 않았다.
- 주문 목록 `DataTable`의 정렬 외부 상태, 필터, 페이지네이션, 행 클릭 상세 진입 로직을 변경하지 않았다.
- 주문번호 및 연결 전표 표시 문자열은 기존 값을 그대로 사용한다. UUID는 표시하지 않는다.
- 권한 조건과 disabled 조건은 기존 JSX 조건을 유지했다.
- 자동 빈 행 입력 유틸과 수정 모달 입력 UX는 변경하지 않았다.
- `src/renderer/print` 및 주문/견적 print route 구현은 변경하지 않았다. 실제 인쇄/미리보기 텍스트 대조는 아래 RED-A 스펙에 별도 경로로 고정했다.

## 6. 검증 결과

통과:

- design-system focused: 2 suites, 10 tests
- design-system 전체: 30 files, 260 tests
- desktop 주문/견적 관련 focused: 주문 상세 20 tests, 목록/견적 상세/가격 설정 관련 tests 통과
- desktop 전체 Vitest 본체: `npm exec vitest run` exit 0
- desktop production build: `npm run build` exit 0
- TypeScript: `tsc -p tsconfig.node.json --noEmit`, `tsc -p tsconfig.web.json --noEmit` exit 0
- lint: 0 errors. 기존 경고와 테스트 mock의 `any` 경고만 남음.

첫 전체 실행에서 발견된 로컬 설치 문제는 `npm ci --ignore-scripts`로 Electron 실행 파일이 빠진 것이었고, `npm rebuild electron` 후 `build-output-cjs-interop`를 포함해 통과했다.

## 7. RED-A 실제 QA 상태

스펙은 디렉터리와 파일명을 모두 `-real-qa`로 만들었다.

`clients/desktop/playwright/883-s4-order-ds-migration-real-qa/883-s4-order-ds-migration-real-qa.spec.ts`

스펙은 `resolveQaShotsDir()`를 사용하고 다음을 단정한다.

1. 주문 목록·상세: 문서번호·상태 라벨·금액·수량·연결 문서번호 문자열.
2. 견적 목록·상세: 문서번호·상태 라벨·금액·수량·연결 문서번호 문자열.
3. 인쇄/미리보기: baseline 텍스트와 현재 텍스트의 핵심 값.

현재 워크트리에는 다른 워크트리의 `5174` renderer와 `8080` API가 떠 있었고, 기본 로컬 스택은 공유 `samhan-postgres`를 사용한다. 공유 DB 로그인은 write이므로 사용하지 않았다. 따라서 격리 서비스 URL, 격리 세션, 전환 전 baseline JSON이 없는 이번 세션에서는 RED-A 3건을 skip했다. 캡처 파일을 만들어 live 증거인 것처럼 남기지 않았다.

실행 확인:

```text
Chromium Playwright real-QA spec 등록: 3 tests
실행 결과: 3 skipped (격리 URL/baseline 미제공)
스크린샷 경로: resolveQaShotsDir() 기본값인 docs/qa/883-s4-order-ds-migration-real-qa/_local
```

PM이 격리 renderer/API와 baseline JSON을 준비하면 다음 환경만 주입해 실제 캡처를 생성할 수 있다.

```powershell
$env:S4_REAL_QA_BASE_URL = 'http://127.0.0.1:<isolated-renderer>'
$env:S4_REAL_QA_ORDER_ID = '<isolated-order-id>'
$env:S4_REAL_QA_ESTIMATE_ID = '<isolated-estimate-id>'
$env:S4_REAL_QA_BASELINE_JSON = '<pre-switch-text-baseline.json>'
$env:REAL_QA_ALLOW_UNTRACKED = '1' # PM이 파일을 추적 목록에 넣기 전 로컬 실행 시에만
.\node_modules\.bin\playwright.cmd test `
  --config=playwright.real-qa.config.ts --project=renderer `
  playwright/883-s4-order-ds-migration-real-qa/883-s4-order-ds-migration-real-qa.spec.ts
```

## 8. 남은 하네스 상태

Git 조작 금지 지시로 새 real-QA 스펙을 add하지 않았다. 그래서 `npm test`/`npm run typecheck`의 real-QA 추적 집합 검사는 해당 새 파일을 미추적으로 보고 실패한다. 이는 구현/TypeScript/Vitest 오류가 아니라 PM이 추적 목록에 넣기 전까지의 저장소 하네스 상태다. Git add/commit/push/PR은 수행하지 않았다.
