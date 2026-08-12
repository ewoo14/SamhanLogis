# PR #1179 (#1094) 재수렴 3차 실서버 라이브 QA — CODEX SOL

- 대상 브랜치: `feat/1094-docno-hyperlink-and-back`
- 대상 HEAD: `d034c5016` (`[FIX] #1094 fix2 — 필드별 fallback 을 되돌리고 provider 쪽에서 고쳤다`)
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로에서 재현되는 결함이 있는가?**

## 판정

**없다. 요청 경로에서 도달 가능한 결함은 0건이다.**

견적·주문·입금보고서의 문서번호 링크, 목록 복귀, 2회 왕복 history, 브라우저 뒤로가기와 주문 검색어 유지가 모두 기대값과 일치했다. 입금보고서 `2026/08/07-8`은 상세 `1,008`, 편집 hydrate 후 첫 행 입력 원문 `1008`(화면 금액 1,008), `행 합계: 1,008원 / 입금 총액 1,008원`이었다. 네 가지 provider 행 조합도 서버 canonical 라인과 정확히 일치했고, 서버에 없는 값이 hydrate로 생성된 경우는 0건이었다.

## 증거 무결성 및 격리

- mock 미사용: `VITE_MOCK_MODE=0`.
- 전용 PostgreSQL: `qa1094reconv3-pg`, 실행 중 포트 `127.0.0.1:41932`.
- 전용 network/gateway: `qa1094reconv3-net`, `qa1094reconv3-gateway`, 실행 중 포트 `127.0.0.1:41980`.
- 전용 실서비스: eureka/auth/user/product/partner/slip/partner-order/dc-config/accounting.
- current worktree renderer: 실행 중 포트 `127.0.0.1:53949`.
- 공유 `samhan-postgres`에는 업무 데이터 쓰기가 없었다. 검증용 3개 문서와 coedit update는 전용 복제본/전용 서비스에만 기록했다.
- `pg_dumpall`은 PowerShell 파이프를 쓰지 않고 소스 컨테이너 파일 → 호스트 파일 → 복제 컨테이너 파일로 전달했다. dump 크기는 `73,084,931 bytes`였다.
- 복제 직후 한글 원문:

```text
SOURCE_HANGUL_BEGIN
(주)한국냉동물류
(주)서울택배
대한화물서비스(주)
SOURCE_HANGUL_END
CLONE_HANGUL_BEGIN
(주)한국냉동물류
(주)서울택배
대한화물서비스(주)
CLONE_HANGUL_END
```

- 각 목록·상세·편집 화면 본문에서 데이터 위치의 `?` 및 대체문자 `�`를 자동 검사했다. 검출 0건이다.
- 최종 구조화 원문은 `docs/qa/2026-08-12-1094-reconv3/measurements.json`이다. `defects` 원문은 `[]`이다.
- 같은 디렉터리에 이 실행 전부터 있던 별도 PNG는 권위 증거에서 제외했다. 아래 22장만 최종 실행이 같은 시각에 다시 생성한 권위 스크린샷이다.

## 화면별 실 GUI 계측

각 화면에서 같은 문서를 `목록 → 상세 → 목록`으로 2회 왕복했다. 스크롤 배열은 연속 4회 읽은 `window.scrollY` 원문이다.

| 화면 | 목록 진입 전 | 1회 복귀 후 | 2회 복귀 후 | `history.length` (`목록→상세1→목록1→상세2→목록2→브라우저 back`) | 브라우저 back |
|---|---:|---:|---:|---|---|
| 견적 `2026/08/10-9` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4→4` | `http://127.0.0.1:53949/`, 상세 재진입 `false` |
| 주문 `2026/06/08-1982` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4→4` | `http://127.0.0.1:53949/`, 상세 재진입 `false` |
| 입금보고서 `2026/08/07-8` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4→4` | `http://127.0.0.1:53949/`, 상세 재진입 `false` |

두 번째 복귀 뒤 주문 검색 원문:

```text
input value = 2026/06/08
URL = #/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
```

입금보고서 표적 원문:

```text
clone DB amount = 1008.00
clone DB lines_json[0].amount = 1008
실 API detail amount = 1008
실 API detail lines[0].amount = 1008
상세 화면 금액 = 1,008
편집 hydrate 첫 행 input value = 1008
화면 합계 = 행 합계: 1,008원 / 입금 총액 1,008원
```

## 네 가지 행 조합 서버값 대조

| 조합 | 문서 | provider 입력 원문 | 서버 canonical 라인 | GUI hydrate 관측 | 합계 | 결과 |
|---|---|---|---|---|---|---|
| 거래처만 있는 행 | `2026/08/07-8` | `대구HVAC솔루션`, 금액·적요 없음 | `대구HVAC솔루션 / 1008 / S5-1094-08` | `대구HVAC솔루션 / 1008 / S5-1094-08`, 채워진 행 1 | `1,008 / 1,008` | 일치 |
| 금액만 있고 거래처가 없는 행 | `2026/08/12-9102` | 금액 `2024`만 | `대구 HVAC 솔루션 / 2024 / RECONV2-AMOUNT-ONLY` | `대구 HVAC 솔루션 / 2024 / RECONV2-AMOUNT-ONLY`, 채워진 행 1 | `2,024 / 2,024` | 일치 |
| 여러 행이 섞인 입금보고서 | `2026/08/12-9103` | 1행 거래처만, 2행 금액 `2222`만 | 1행 `대구 HVAC 솔루션 / 1111 / RECONV2-MULTI-A`; 2행 `능동에어컨(박수천) / 2222 / RECONV2-MULTI-B` | 서버 2행과 필드별 동일, 채워진 행 2 | `3,333 / 3,333` | 일치 |
| 행이 하나뿐인 입금보고서 | `2026/08/12-9104` | 빈 provider item 1개 | `능동에어컨(박수천) / 4040 / memo NULL` | `능동에어컨(박수천) / 4040 / memo input ""`, 채워진 행 1 | `4,040 / 4,040` | 일치 |

서버 `NULL` 적요는 빈 입력 `""`로 표시됐고 새로운 값은 만들어지지 않았다. 각 화면의 끝에는 사용자 입력용 `새 빈 행` 슬롯이 하나 있으나, 그 슬롯의 거래처·금액·적요는 모두 빈 값이어서 서버에 없는 업무 값 생성으로 판정할 항목은 없었다.

## 스크린샷

최종 권위 PNG 22장은 `docs/qa/2026-08-12-1094-reconv3/`에 있다.

- `00-estimate-filtered-document-link.png`
- `01-estimate-list-before-link-scroll-640.png`
- `02-estimate-detail-from-document-link.png`
- `03-estimate-list-after-first-roundtrip-scroll-640.png`
- `04-estimate-list-after-second-roundtrip-scroll-640.png`
- `05-estimate-browser-back-not-detail.png`
- `06-order-filtered-document-link-keyword-2026-06-08.png`
- `07-order-list-before-link-scroll-640.png`
- `08-order-detail-from-document-link.png`
- `09-order-list-after-first-roundtrip-keyword-retained-scroll-640.png`
- `10-order-list-after-second-roundtrip-keyword-retained-scroll-640.png`
- `11-order-browser-back-not-detail.png`
- `12-cash-filtered-document-link-2026-08-07-8.png`
- `13-cash-list-before-link-scroll-640.png`
- `14-cash-detail-2026-08-07-8-amount-1008.png`
- `15-cash-list-after-first-roundtrip-scroll-640.png`
- `16-cash-list-after-second-roundtrip-scroll-640.png`
- `17-cash-browser-back-not-detail.png`
- `20-cash-partner-only-hydrated-to-server-canonical-1008.png`
- `21-cash-amount-only-no-partner-hydrated-to-server-canonical-2024.png`
- `22-cash-mixed-multiple-rows-hydrated-to-server-canonical-1111-2222.png`
- `23-cash-single-row-hydrated-to-server-canonical-4040.png`

## 못 한 것

없다. 요청된 세 화면, 640px 복원, 2회 왕복 history, 주문 검색어, 입금보고서 상세/편집 hydrate, 네 행 조합, 실 PNG를 모두 전용 실서비스 GUI에서 수행했다.

## 종료 점검

```text
제거한 qa1094reconv3-* 컨테이너 = 13
제거한 qa1094reconv3-net = 1
renderer listener 53949 = 없음
격리 DB/gateway listener 41932/41980 = 없음
.codex-tmp/qa1094reconv3 = 없음
samhan-postgres:/tmp/qa1094reconv3-all.sql = 없음
```

삭제된 추적 파일과 지정 추적 파일은 최종 검증 명령의 실측값을 따른다.

```text
FINAL_VERIFY=PASS
DELETED_TRACKED_FILES=0
tools/.s24-build-only/build/deep/tracked-writer.mjs = 존재, tracked, 42 bytes
SHA-256 = F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3
QA_CONTAINERS=0
QA_NETWORK=0
QA_LISTENERS=0
QA_TEMP_EXISTS=False
SOURCE_TMP_EXISTS=FALSE
```

**삭제된 추적 파일 0건.** 지정 파일 `tools/.s24-build-only/build/deep/tracked-writer.mjs`도 정상이다.
