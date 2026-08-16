# PR #1229 CODEX SOL 재수렴 적대검증 보고서

## ① 환경 확인

라운드 시작 직후 아래 명령을 지시된 순서로 실행했다.

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\wwh
git rev-parse HEAD                 # ee801c565 (main 병합 직후)
git rev-parse --abbrev-ref HEAD    # feat/order-web-warehouse-by-category
git status --porcelain
gh pr checks 1229                  # pass/fail 을 세어 적어라
```

시작 시 원문:

```text
ee801c565c197040e8c306af0c35d8aae2b4189c
feat/order-web-warehouse-by-category

GitGuardian Security Checks  fail
Desktop Playwright (mock 회귀 hard gate)  pending
Frontend Desktop (typecheck + lint + build)  pending
나머지 43개 check  pass
```

`git status --porcelain`은 시작 시 출력이 없었다. 검증 산출물을 만든 뒤 최종 상태에는 `?? docs/qa/pr-1229-sol-r5/`만 있으며, `git add`, `git commit`, `git push`는 실행하지 않았다.

## ② CI 카운트

| 시점 | pass | fail | pending/in progress | 합계 |
|---|---:|---:|---:|---:|
| 라운드 시작 | 43 | 1 | 2 | 46 |
| 보고 직전 | 45 | 1 | 0 | 46 |

보고 직전 실패 1개는 `GitGuardian Security Checks`이고, 나머지 45개는 모두 pass다.

## ③ 도달 결함

실 사용자가 주문서웹 UI를 통해 도달할 수 있는 이 트랙 결함은 발견하지 못했다.

- 품목분류 기반 창고 결정: UI 확정 후 저장된 `CONFIRMED` 이력에서 정상 확인.
- 금액 단일원천: 품목표·미리보기·최종확인·DB 저장값이 전부 동일.
- 식별자: 두 UI 시나리오의 가시 텍스트 UUID 정규식 일치 수가 각각 0이며, 정상 opaque 응답을 소비한 PR HEAD 확정 경로가 200으로 완료됨.

## ④ 라이브QA 표·스크린샷

### 실서버 및 PR HEAD 증명

공유 DB 스냅샷을 격리 PostgreSQL로 복제하고, PR HEAD에서 빌드한 변경 JAR을 격리 컨테이너로 실행했다. 공유 `partner-service`에는 정체성 조회만 수행했고 공유 데이터 write는 하지 않았다.

```text
HOST|partner-order-service.jar|86f77f73e1e197152468aef41db08c321c406976377f568a9d2c5b7739f6183a
CONTAINER|sol1229r5-partner-order|86f77f73e1e197152468aef41db08c321c406976377f568a9d2c5b7739f6183a

HOST|product-service.jar|ce5f8b4fdecd82c1063fa09364db8b6b7d4c4b148bca706a684bbe726375a0bd
CONTAINER|sol1229r5-product|ce5f8b4fdecd82c1063fa09364db8b6b7d4c4b148bca706a684bbe726375a0bd

HOST|partner-auth-service.jar|f3c4177faf41055274683128ebb1be6de77c167dc3ac4128c7c08902cd50bc7a
CONTAINER|sol1229r5-partner-auth|f3c4177faf41055274683128ebb1be6de77c167dc3ac4128c7c08902cd50bc7a
```

격리 gateway/Eureka/product/partner-order/dc-config/partner-auth health는 실행 시 모두 HTTP 200이었다.

### 행 수와 창고 결정

| UI 절차 | 미리보기 백엔드 응답 | 화면 행 수 | confirm | 저장 이력 창고 | 미분류 | legacy 예외 |
|---|---:|---:|---:|---|---:|---|
| AR-CH01 수량 1 → 주문서 발송 | lines 1 | 1 | HTTP 200 | `2` | 0 | `AR-CH01` |
| AJ060MXHNBC1 수량 1 + AXJ-YA2512N 수량 1 → 주문서 발송 | lines 2 | 2 | HTTP 200 | `00003` | 0 | 없음 |
| dc-config 실제 중단 상태에서 AR-CH01 미리보기 | data null/lines 0, HTTP 503 | 오류 행 1 | 진행 차단 | 해당 없음 | 해당 없음 | 해당 없음 |

창고 원문:

```text
2026/08/16-2|36960.00|{"orderNo":"2026/08/16-2","warehouseCode":"2","unclassifiedCount":0,"unclassifiedModels":[],"legacyExceptionModels":["AR-CH01"]}
2026/08/16-3|1576036.00|{"orderNo":"2026/08/16-3","warehouseCode":"00003","unclassifiedCount":0,"unclassifiedModels":[],"legacyExceptionModels":[]}
```

### 네 단계 금액 대조

| 품목/합계 | 품목표 | 미리보기 | 최종확인 | 저장값 |
|---|---:|---:|---:|---:|
| AR-CH01 | 36,960 | 36,960 | 36,960 | 36,960 |
| AJ060MXHNBC1 | 1,523,236 | 1,523,236 | 1,523,236 | 1,523,236 |
| AXJ-YA2512N | 52,800 | 52,800 | 52,800 | 52,800 |
| AJ060MXHNBC1 + AXJ-YA2512N 합계 | 1,576,036 | 1,576,036 | 1,576,036 | 1,576,036 |

저장 라인 원문:

```text
2026/08/16-2|AR-CH01|homemulti|1|36960.00|36960.00|33600.00|3360.00|PRICE
2026/08/16-3|AJ060MXHNBC1|homemulti|1|1523236.00|1523236.00|1384760.00|138476.00|PRICE
2026/08/16-3|AXJ-YA2512N|homemulti|1|52800.00|52800.00|48000.00|4800.00|PRICE
```

### 스크린샷

아래 9개를 원본 해상도로 직접 열어 한글, 행 수, 금액, 버튼 상태를 육안 확인했다.

| 파일 | 바이트 | 육안 확인 내용 |
|---|---:|---|
| `screenshots/01-ar-ch01-catalog.png` | 114,794 | AR-CH01 품목표 36,960 |
| `screenshots/01-ar-ch01-preview.png` | 12,484 | 1행, 36,960 |
| `screenshots/01-ar-ch01-final.png` | 10,592 | 1행, 36,960 |
| `screenshots/01-ar-ch01-result.png` | 4,583 | 전송 완료 |
| `screenshots/02-pair-catalog.png` | 108,130 | 선택 2건, AXJ 52,800 가시 |
| `screenshots/02-pair-preview.png` | 15,576 | 2행, 합계 1,576,036 |
| `screenshots/02-pair-final.png` | 14,194 | 2행, 두 단가 동일 |
| `screenshots/02-pair-result.png` | 4,564 | 전송 완료 |
| `screenshots/03-price-preview-503-fail-closed.png` | 10,493 | 오류 행 1, 합계 `—`, 주문하기 비활성 |

## ⑤ 회귀

- 직전 fix `015d45619`: `OpaqueUuidDecoderTest`를 `--rerun-tasks`로 재실행했고 `BUILD SUCCESSFUL`, 15 tasks executed였다. 22자리 순수 숫자 거부와 오류 메시지 통일 케이스가 통과했다.
- 정상 opaque: 실제 product-service가 발급하는 22자 URL-safe opaque ID를 사용한 인증 세션 확정 요청은 HTTP 200, 저장 금액 36,960으로 통과했다. 토큰 문법 실측은 길이 22, `[A-Za-z0-9_-]` 일치, 순수 숫자 아님이었다.
- UI 정상 확정 두 건 모두 페이지 오류 0, 가시 UUID 0.
- 실제 dc-config 컨테이너 중단 시 미리보기는 HTTP 503 원문 `가격 미리보기 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.`를 받았고, 화면은 가격·합계를 `—`로 지우며 주문 진행을 비활성화했다. 서비스 복구 후 health 200을 확인했다.

## ⑥ 증거 무결성 자기 고지

기존 PR 본문에는 같은 블록에서 `매칭 4 / 미매칭 2`로 정정해 놓고도 뒤쪽에 `주문된 모델 6개 중 3개가 상품 마스터에 없습니다`라는 과거 수치가 남아 있었다. 이는 내부적으로 모순되는 증거이므로 이 라운드에서 PR 본문을 `2개`로 직접 정정했고, 재조회로 과거 `3개` 문구가 남지 않았음을 확인했다.

정정 과정의 첫 GraphQL 호출은 Windows 파이프 인코딩 때문에 PR 한글 본문을 `?`로 훼손했다. 게시 후 대조에서 즉시 발견했고, GitHub `userContentEdits`의 직전 한글 원문을 회수해 `3개 → 2개`만 반영한 뒤 UTF-8 byte body로 복원했다. 최종 재조회 결과는 `BODY_LEN=1804`, `KOREAN_OK=True`, `OLD_REMAINS=False`, `NEW_PRESENT=True`, 물음표 치환 수 `0`이다.

라이브QA에서 공유 데이터 write는 0건이다. 공유 DB 확인값은 정리 전후 모두 `orders=5`, `drafts=12`, `history=5990`, 이번 격리 주문번호 3건 존재 수 `0`, 격리 QA 수정자 marker `0`이었다. 격리 DB에는 다음 write가 있었고 컨테이너 삭제로 전부 회수했다: QA 거래처 인증 비밀번호/상태/로그인 시각, 세션·로그인 시도·튜토리얼 상태/로그, 프론트 로그, 임시저장, 확정 주문 3건과 주문 이력.

## ⑦ 프로세스 회수 결과

```text
REMNANT_CONTAINERS=0
REMNANT_NETWORKS=0
REMNANT_LISTENERS=0
QA_PROCESS_REMNANTS=0
REMNANT_TEMP_FILES=0
```

회수 대상 포트는 25128, 25129, 28761, 29084, 29088, 29089, 29091이며 모두 listener 0이다. 다른 동시 라운드의 `sol1241r14-*` 자원과 공유 `samhan-*` 스택은 건드리지 않았다.

## ⑧ 판정

**도달 결함 0건.**
