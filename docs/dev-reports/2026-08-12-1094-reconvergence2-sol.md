# PR #1179 (#1094) 재수렴 2차 실서버 라이브 QA — CODEX SOL

- 대상 브랜치: `feat/1094-docno-hyperlink-and-back`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로에서 재현되는 결함이 있는가?**

## 판정

**있다. 도달 가능한 결함 1건이다.**

입금보고서 DRAFT 편집에서 실제 accounting-service coedit snapshot에 부분 행이 존재하면 서버 상세 응답의 필드별 fallback이 적용되지 않는다. 표적 문서 `2026/08/07-8`은 목록/상세에서 `1,008`이지만, 거래처만 가진 협업 행으로 편집 hydrate 후 첫 행 금액이 `""`이고 화면 합계는 `행 합계: 0원 / 입금 총액 0원`이었다. 요청 기대값인 첫 행 `1,008`, `행 합계 1,008원 / 입금 총액 1,008원`에 도달하지 못했다.

견적·주문의 문서번호 링크/목록 복귀/history와 주문 검색어 유지에는 요청 경로에서 재현 결함이 없었다. 입금보고서도 문서번호 링크/목록 복귀/history와 상세 `1,008`까지는 정상이고, 편집 hydrate에서 실패한다.

## 증거 무결성 및 격리

- mock 미사용: `VITE_MOCK_MODE=0`.
- 전용 PostgreSQL: `qa1094reconv2-pg`, `127.0.0.1:40932`.
- 전용 network/gateway: `qa1094reconv2-net`, `qa1094reconv2-gateway`, `127.0.0.1:40980`.
- 전용 실서비스: eureka/auth/user/product/partner/slip/partner-order/dc-config/accounting.
- current worktree renderer: `127.0.0.1:52949`.
- 공유 `samhan-postgres`에는 dump 파일 생성 외 업무 데이터를 쓰지 않았고, 검증 데이터/coedit update는 전용 복제본과 전용 서비스에만 기록했다.
- `pg_dumpall`은 PowerShell 파이프를 쓰지 않고 컨테이너 파일 → 호스트 파일 → 복제 컨테이너 파일로 전달했다. dump 크기는 `73,054,153 bytes`였다.
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

- 화면 본문 자동 검사와 PNG 육안 확인에서 데이터 위치의 `?` 및 대체문자 `�`는 0건이었다.
- 1440×420에서는 현재 필터된 견적 목록의 최대 `scrollY`가 `614` (`scrollHeight=1034`, `innerHeight=420`)여서, 요청한 640px 위치를 실제로 만들기 위해 계측 viewport를 1440×380으로 설정했다. 앱/CSS/업무 데이터는 바꾸지 않았다.

## 화면별 실 GUI 계측

각 화면에서 동일 문서를 `목록 → 상세 → 목록`으로 2회 왕복했다. 배열은 연속 4회 읽은 `window.scrollY` 원문이다.

| 화면 | 목록 진입 전 | 1회 복귀 후 | 2회 복귀 후 | `history.length` (`목록→상세1→목록1→상세2→목록2→브라우저 back`) | 브라우저 back |
|---|---:|---:|---:|---|---|
| 견적 `2026/08/10-9` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4→4` | `http://127.0.0.1:52949/`, 상세 재진입 `false` |
| 주문 `2026/06/08-1982` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4→4` | `http://127.0.0.1:52949/`, 상세 재진입 `false` |
| 입금보고서 `2026/08/07-8` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4→4` | `http://127.0.0.1:52949/`, 상세 재진입 `false` |

2회 왕복에서 최초 상세 진입 후 history 길이는 모두 `4`로 고정됐고, 브라우저 뒤로가기는 어느 화면에서도 상세로 재진입하지 않았다.

주문 검색 원문:

```text
목록 URL = #/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
1회 복귀 input value = 2026/06/08
2회 복귀 input value = 2026/06/08
2회 복귀 URL = #/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
```

입금보고서 표적 원문:

```text
clone DB amount = 1008.00
clone DB lines_json[0].amount = 1008
실 API detail amount = 1008
실 API detail lines[0].amount = 1008
상세 화면 금액 = 1,008
편집 hydrate 첫 행 금액 = ""
편집 hydrate 첫 행 적요 = ""
화면 합계 = 행 합계: 0원 / 입금 총액 0원
```

## 네 가지 협업 행 조합 대조

모든 조합은 전용 accounting-service의 실제 `POST /accounting/cash-receipts/{id}/collab/coedit/update`에 Yjs update를 기록하고, 같은 서비스의 상세 API 원문과 실제 GUI 편집 화면을 대조했다.

| 조합 | 문서 | 서버 행 원문 | provider 부분 행 | GUI 관측 | 결과 |
|---|---|---|---|---|---|
| 거래처만 있는 부분 행 | `2026/08/07-8` | `대구HVAC솔루션 / 1008 / S5-1094-08`, 헤더 `1008` | 거래처 3필드만, 금액·적요 없음 | `대구HVAC솔루션 / "" / ""`, `행 합계: 0원 / 입금 총액 0원` | 불일치 |
| 금액만 있고 거래처 없는 행 | `2026/08/12-9102` | `대구 HVAC 솔루션 / 2024 / RECONV2-AMOUNT-ONLY`, 헤더 `2024` | 금액 `2024`만 | `대구 HVAC 솔루션 / 2024 / ""`, `행 합계: 2,024원 / 입금 총액 0원` | 불일치 |
| 여러 행 혼합 | `2026/08/12-9103` | 1행 `대구 HVAC 솔루션 / 1111 / RECONV2-MULTI-A`; 2행 `능동에어컨(박수천) / 2222 / RECONV2-MULTI-B`; 헤더 `3333` | 1행 거래처만, 2행 금액만 | 1행 `대구 HVAC 솔루션 / "" / ""`; 2행 `능동에어컨(박수천) / 2222 / ""`; `행 합계: 2,222원 / 입금 총액 0원` | 불일치 |
| 행 하나뿐 | `2026/08/12-9104` | `능동에어컨(박수천) / 4040 / memo 없음`, 헤더 `4040` | 빈 Y.Map 1행 | `능동에어컨(박수천) / "" / ""`, `행 합계: 0원 / 입금 총액 0원` | 불일치 |

서버에 없는 값이 GUI에 새로 만들어진 경우는 0건이었다. 반대로 서버에 있는 헤더 금액, 행 금액 또는 적요가 부분 provider와 결합할 때 소실됐다. 거래처 fallback은 금액-only/빈 provider 행에서도 서버값과 일치했다.

## 도달 가능한 결함

### F1. 입금보고서 coedit 부분 행에서 필드별 서버 fallback이 적용되지 않아 서버값이 소실됨

1. DRAFT 수기 입금보고서에 실제 coedit update가 있고 provider 행이 일부 필드만 가진다.
2. 상세 API에는 헤더 금액과 `lines[]`의 거래처·금액·적요가 존재한다.
3. 편집 화면은 provider에 있는 필드는 일부 표시하지만, 없는 필드의 서버 fallback을 안정적으로 복원하지 않는다.
4. 표적 `2026/08/07-8`은 상세 `1,008` 이후 편집 첫 행 금액 `""`, 합계 `0원 / 0원`으로 재현된다.
5. 금액-only, 혼합 여러 행, 한 행 문서에서도 같은 계열의 소실이 재현된다.

## 스크린샷

이번 라운드가 생성한 PNG는 다음 22장이다. 경로는 모두 `docs/qa/2026-08-12-1094-reconv2/`이다.

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
- `20-cash-partner-only-provider-server-amount-fallback-1008.png`
- `21-cash-amount-only-provider-server-partner-fallback-2024.png`
- `22-cash-mixed-multiple-rows-field-fallback-1111-2222.png`
- `23-cash-single-row-empty-provider-server-field-fallback-4040.png`

수치 및 서버/GUI 구조화 원문은 같은 디렉터리의 `measurements.json`에 저장했다.

## 못 한 것

없다. 요청된 세 화면, 640px 복원, 2회 왕복 history, 주문 검색어, 표적 상세/편집 hydrate, 네 행 조합, 스크린샷을 모두 실서비스 GUI에서 수행했다.

## 종료 점검

```text
QA_CONTAINERS=0
QA_NETWORK=0
RENDERER_LISTENER=False
TEMP_EXISTS=False
SOURCE_TMP_EXISTS=False
```

**삭제된 추적 파일 0건.** `git ls-files --deleted`는 정리 전후 모두 빈 출력이었다.

`tools/.s24-build-only/build/deep/tracked-writer.mjs`는 정리 전후 모두 존재하며 `42 bytes`, SHA-256 `F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3`이다.
