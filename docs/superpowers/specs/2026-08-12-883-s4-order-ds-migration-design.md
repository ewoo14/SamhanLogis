# #883 S4 주문서·견적서 design-system 표준화 설계

## 목표

주문서와 견적서의 공통 셸 및 상태 표현을 `@samhan/design-system` 표준으로 전환한다. 전환 대상은 시각 토큰과 컴포넌트이며 금액·수량·상태 라벨·날짜·문서번호, 정렬·필터·페이지네이션·상세 진입·권한·입력 UX·인쇄 출력은 보존한다.

## 조사 근거

- `sales.module.css`: 1,194줄, 런타임 사용 클래스 56개, 미사용 클래스 44개.
- `salesScope`: 주문/견적 관련 실제 7개 페이지에서 사용.
- 기존 전표 DS 축: `SlipStatusBadge`, `SlipNumberDisplay`, `Badge`, `Button`, `Card`, `DataTable`, `Input`, `Select`, `Modal`, `EstimateLineRow`, `LineRow`, `PrintPreview`.
- 주문 상태는 `DRAFT`, `ON_HOLD`, `CONFIRMING`, `CONFIRMED`, `CANCELED`, `CONVERTED` 6종이며 기존 라벨은 각각 `진행중`, `보류`, `확인중`, `완료`, `취소`, `전환완료`다.
- 견적 상태는 `QUOTE_DRAFT`, `QUOTE_SENT`, `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, `QUOTE_CONVERTED` 5종이며 기존 라벨은 각각 `작성중`, `발송완료`, `수주완료`, `거절`, `전표변환완료`다.

## 토큰 전환

| 기존 어휘 | 기존 값 | 전환 토큰 | 영향 |
|---|---:|---|---|
| `--c-bg` | `#fff` | `--surface-card` | 값·의미 동일 |
| `--c-line` / `--c-col-sep` | `#000` | `--line-default` | 순검정선에서 DS 표준선으로 변경 |
| `--c-accent` | `#2563eb` | `--action-brand` | 기존 파랑에서 DS 액션색으로 변경 |
| `--c-muted` | `#6b7280` | `--ink-secondary` | 의미 토큰으로 치환 |
| `--c-strong` | `#111827` | `--ink-primary` | 의미 토큰으로 치환 |

인쇄·미리보기 구현은 수정하지 않는다. 현재 `sales.module.css`의 인쇄 전용 dead CSS는 이관하지 않고, 실제 인쇄 표면의 기존 구현과 계약 테스트를 별도로 검증한다.

## 컴포넌트 설계

### `OrderStatusBadge`

전표의 `SlipStatusBadge` 구조를 따르는 주문 전용 상태 컴포넌트다. 상태 union을 컴포넌트가 소유하고, 기존 6개 상태와 라벨을 1:1 보존한다. `HTMLAttributes<HTMLSpanElement>`와 `className`을 전달받아 목록·상세·모바일 요약에서 동일하게 쓸 수 있게 한다.

### `OrderNumberDisplay`

주문번호를 사용자 노출 비즈니스 식별자로 표시하는 span 컴포넌트다. UUID prop을 받지 않으며, `size`와 `className`을 지원한다. 값 자체는 부모가 전달한 주문번호를 그대로 출력하여 문서번호 문자열을 변경하지 않는다.

견적 상태는 기존 `Badge`의 DS variant를 유지하되 상태 라벨·variant 매핑을 화면별 로컬 중복 없이 공통 helper로 이동한다. 견적용 별도 상태 종류를 주문 상태에 임의로 합치지 않는다.

## 화면 배선

- 주문 목록: `OrderStatusBadge`, `OrderNumberDisplay`, 기존 `DataTable`과 DS `Badge`/`Button`을 사용한다.
- 주문 상세: 로컬 `statusBadgeStyle` inline 색상을 삭제하고 `OrderStatusBadge`를 사용한다. 버튼 권한·disabled와 행 입력·자동 빈 행은 변경하지 않는다.
- 견적 목록: 기존 `DataTable`/`Badge`는 유지하되 DS 토큰 기반 상태 매핑과 문서번호 표시를 공통화한다.
- 견적 상세/견적 가격 설정/주문 승인/DC 설정: `salesScope`만 제거하고 DS 컴포넌트 및 최소 layout class로 대체한다.
- `MergeConvertDialog`: 업무 동작과 입력 UX를 유지하면서 dead legacy 스타일 의존만 제거한다.

## CSS 축소

실제 runtime 56개만 보존한다. dead 44개(legacy 버튼·카테고리, 주소 dock, 자동완성, 인쇄 preview, menu toolbar, history/toast 등)는 옮기지 않는다. 정적 분석 누락을 막기 위해 변경 후 전체 대상 화면을 렌더링하고 CSS module export 참조 오류를 확인한다.

## 검증

1. DS 컴포넌트 단위 테스트에서 상태 종류·라벨·주문번호 문자열을 고정한다.
2. 전환 전/후 RED-A fixture에서 주문 목록·상세와 견적 목록·상세의 금액·수량·상태 라벨·날짜·문서번호를 텍스트로 비교한다.
3. 인쇄·미리보기 텍스트/출력 계약을 별도 확인한다.
4. desktop Vitest 전량, typecheck, lint를 실행한다.
5. `clients/desktop`에서 `-real-qa` 디렉터리/파일명과 `resolveQaShotsDir()`를 사용하는 headless Chromium-1217 Playwright를 격리 서비스로 실행한다. 공유 DB 로그인은 사용하지 않고, 시작한 서버는 종료한다.
