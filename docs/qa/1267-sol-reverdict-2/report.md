# PR #1267 CODEX SOL 적대검증 재판정 보고서 (2회차)

검증일: 2026-08-18 KST  
유일 질문: **실 사용자가 화면을 통해 재현할 수 있는 결함이 있는가**

## ① 검증 SHA·main 병합

```text
요청 검증 SHA                    ce7b6bfef2632a776bd9dd88aaf26a6b6a8c490a
검증 브랜치                      fix/partner-master-and-importer
시작 시 origin/main              b9d9ab16d447ade3ae548acbf42da2b13f805cc0
git merge origin/main --no-edit  Already up to date.
병합 충돌                        0건
병합 후 HEAD                     ce7b6bfef2632a776bd9dd88aaf26a6b6a8c490a
```

시작 시 작업트리는 clean이었다. `git add/commit/push`와 제품 코드 수정은 수행하지 않았다. 이번 보고서·라이브 스펙·fixture·PNG만 미추적 QA 산출물로 생성했다.

## ② 같은 파일 2회 import 행 수 변화

공유 `product_db`를 읽기 전용 덤프해 `sol1267r2-pg` 격리 DB에 복원하고, 브랜치 `product-service.jar`를 `18184`에서 기동했다. `resolveQaCredential()`로 로그인하고 `SAMHAN_GATEWAY_ATTESTATION`을 주입해 실제 multipart HTTP를 같은 파일로 두 번 호출했다.

fixture에는 이름이 같고 코드가 다른 두 행을 넣었다.

```text
QA1267R2-A | SOL 재판정 동명 품목 | 규격-A
QA1267R2-B | SOL 재판정 동명 품목 | 규격-B
```

| 시점 | 전체 활성 품목 | fixture 코드 활성행 | HTTP/import 결과 |
|---|---:|---:|---|
| 실행 전 | 2,982 | 0 | - |
| 1회차 후 | 2,984 | 2 | 200 · imported=2 · updated=0 |
| 2회차 후 | **2,984** | **2** | 200 · imported=0 · updated=2 |

두 실행의 `sourceFileHash`도 동일했다. **같은 파일을 두 번 import해도 행은 두 배가 되지 않았다.** 각 코드의 DB `count(*) over(partition by product_code)`는 모두 1이었다.

파일 내부에 완전히 같은 `product_code=QA1267R2-C` 행을 두 번 넣은 별도 실호출도 수행했다.

```text
실행 전 0행 → HTTP 200, totalRows=2, imported=1 → 실행 후 1행
```

## ③ 동명 vs 진짜 중복 판정 근거

구현의 동일성 키는 이름이 아니라 코드다.

```text
코드가 다름  → 서로 다른 mainCode → 서로 다른 products 행 (동명 허용)
코드가 같음  → 같은 mainCode + productByMainCode 캐시 → 파일 안 1행
재수입       → ON CONFLICT (product_code) ... DO UPDATE → 기존 행 갱신
alias 재수입 → alias_code 활성 unique + upsert → 기존 alias 갱신
```

실측으로 코드가 다른 A/B는 2행, 같은 코드 C/C는 1행, 같은 파일 재실행은 추가 0행이었다. 따라서 이번 fix가 이름 차단을 제거하면서 진짜 중복까지 재유입시키는 동작은 재현되지 않았다.

## ④ 동명 그룹 화면 구분 — 실데이터 규모·행 수

공유 DB 읽기 전용 재계수:

```text
활성 동일 이름 전체                  156그룹 · 583행
서로 다른 product_code 활성 동명      98그룹 · 374행
최대 동명 그룹                        14행
```

정찰 당시 587행이던 전체 활성 동명은 현재 583행이다. 서로 다른 코드 기준 핵심 수치는 98그룹·374행이다.

5행 fixture 대신 실제 기존 `SHEET` 계보 최대 그룹 `냉난방 무풍 벽걸이 실내기`를 사용했다. 14행 모두 2026-07-28 생성된 기존 행이다.

| 화면 | Playwright DOM 실측 | 구분 결과 |
|---|---:|---|
| 기초품목 관리 `/products/catalog` | **14행** | 모델명 열에 서로 다른 코드 14개 표시 |
| 견적품목 관리 검색 모달 | **14행** | 결과 첫 열에 서로 다른 코드 14개 항상 표시 |

Playwright는 Chromium headless, `VITE_MOCK_MODE=0`, 별도 Vite `5233`, branch JAR `18184` 조합으로 실행했다. 최종 실행은 `1 passed (3.2s)`였다. 상단·하단 모달 캡처를 합쳐 코드 14개 전부를 눈으로 확인했다.

## ⑤ 유니크 제약 부재 시 대체 수단

`products.name` unique 제약/인덱스는 **0개**다. 동명이 정상 데이터이므로 이 판단은 현재 98그룹·374행과 화면 캐논에 부합한다.

진짜 중복의 대체 수단은 존재한다.

- `ux_products_product_code_active`, `ux_products_product_code_mig2_active`: 활성 `product_code` unique
- importer의 `ON CONFLICT (product_code) WHERE is_deleted=false DO UPDATE`
- importer 내부 `productByMainCode`: 한 파일 내 동일 main code 1회 upsert
- `ux_product_aliases_alias_active`: 활성 `alias_code` unique
- importer의 파일 hash별 PostgreSQL advisory transaction lock: 같은 파일 동시 실행 직렬화

`model_name`도 활성 unique지만 importer가 `model_name=product_code`로 저장하므로 이름 차단 수단이 아니라 코드 중복의 추가 방어다. **name 자체의 중복을 막는 대체 수단은 없고, 이는 동명을 허용한다는 현재 계약과 일치한다.**

## ⑥ 테스트 약화 판정

fix diff는 단위 테스트 `importCsv_활성_동명_기초품목은_CONFLICT로_차단한다`를 `품목코드별로_정상_등록한다`로 바꿨다. 이름 중복 차단 성질은 의도적으로 삭제됐으므로 더 이상 테스트가 지키지 않는다.

그러나 진짜 중복 방어까지 약해진 것은 아니다.

- `EcountProductImporterIT`는 fix에서 수정되지 않았다.
- `sameNameSequenceCodes_are_all_aliases_and_lookupable()`가 동일 24행 fixture를 실제로 두 번 import한다.
- 두 번째 실행 `imported=0`, `updated=24`, alias 24를 단언한다.
- 새 실행 결과: **6 tests · failures 0 · errors 0 · skipped 0 · EXIT 0**.
- 별도 실제 HTTP/격리 DB 계수도 §②와 같이 통과했다.

따라서 **동명 차단 기대는 제거됐지만, 코드 기준 idempotency는 기존 IT·DB unique·실호출이 계속 지킨다.**

## ⑦ 잃으면 안 되는 것 재현

```text
dc-config 활성 partners                        211행
partner-service 활성 partners                  7,310행
partner_code + 정규화 biz_no 일치              211/211
미대응                                           0
기존 거래처 2568700899 partner admin 조회       HTTP 200
기존 거래처 2568700899 dc public 조회           HTTP 200
기존 품목 최대 동명 그룹 기초표                 14행
기존 품목 최대 동명 그룹 검색 모달              14행
화면 표시 UUID                                  0건
```

UUID 검사는 두 화면의 visible text와 `title`, `placeholder`, `aria-label`을 전수 스캔했다. 목록에 ID/UUID 열은 없었고, PNG에서도 UUID를 발견하지 못했다.

404 경로도 다시 정적 추적했다. `getCustomerData`는 `samhanApi.ts`의 legacy RPC 등록·설명에만 있고 실제 호출자는 0곳이다. fix 보고서는 이를 현재 죽은 legacy 호환 경로라고 답했으며, 살아날 예정인 일정·호출자·구현은 저장소에서 확인되지 않았다. 따라서 현행 화면 도달 결함으로 세지 않는다.

## ⑧ 스크린샷 — 행 수·경로

`resolveQaShotsDir()`에 `QA_SHOTS_DIR`와 명시적 overwrite 의도를 주입해 아래 3장을 생성했다. 세 PNG를 모두 직접 열어 로그인 화면·0행 화면·mock 화면이 아님을 확인했다.

1. **기초품목 14행 전부**  
   `C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-sol-reverdict-2\playwright\screenshots\01-existing-duplicate-catalog-14-rows.png`
2. **검색 모달 DOM 14행 — 상단 코드**  
   `C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-sol-reverdict-2\playwright\screenshots\02-existing-duplicate-search-modal-14-rows-with-code-column.png`
3. **검색 모달 DOM 14행 — 스크롤 하단 코드**  
   `C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-sol-reverdict-2\playwright\screenshots\03-existing-duplicate-search-modal-bottom-codes.png`

확정 스펙 경로:

```text
clients/desktop/playwright/1267-sol-reverdict-2/1267-sol-reverdict-2-live.spec.ts
```

## ⑨ 미검증 축

- 카탈로그/검색 모달 외 다른 업무 화면의 UUID tooltip·placeholder 전수
- 실제 인쇄 창/인쇄물의 UUID 노출 전수: 이번 두 화면에는 인쇄 진입점이 없어 밟지 못했다.
- 죽은 `getCustomerData` 경로의 미래 재도입 계획: 저장소에 계획이 없어 확인할 수 없었다.

위 항목은 도달 결함 0건에 포함하지 않았다.

## ⑩ CI 귀속

PR SHA `ce7b6bfef`의 현재 상태:

```text
빌드 + 테스트 (user+product+inventory+logging)  PASS
  └ EcountProductImporterIT 기존 2실패          해소
그 밖 CI/Docs/Harness/Flyway/보안 job           PASS
Desktop Playwright (mock 회귀 hard gate)        FAIL
```

남은 실패 원문은 GitHub runner에 QA 자격이 없다는 오류이며 stack은 이번 PR이 추가한 다음 파일을 직접 가리킨다.

```text
clients/desktop/playwright/1267-fix-round1/1267-fix-round1-live.spec.ts:10
resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
```

이 스펙 경로/파일명은 `playwright.config.ts`의 real-QA `testIgnore` 패턴에 걸리지 않아 mock hard gate가 module-load한다. base `main`에는 이 파일이 없으므로 **PR 귀속 CI 실패 1건**이다. 이는 실 사용자 화면 결함은 아니지만 현재 CI가 red다.

## ⑪ 머지 가능/불가 — 도달 결함 N건

## **머지 불가 — 실 사용자 화면 도달 결함 0건, PR 귀속 CI 실패 1건**

- 같은 파일 2회 import와 파일 내 같은 코드 중복 모두 행 증가가 차단됐다.
- 코드가 다른 동명은 14행 실화면에서 사용자에게 구분된다.
- 거래처 211/211·미대응 0과 기존 거래처/품목 조회를 재현했다.
- 현행 화면에서 재현 가능한 기능 결함은 찾지 못했다.
- 다만 PR이 추가한 라이브 스펙의 CI 범위 오류로 check가 red라 현재 상태로는 머지할 수 없다.

## ⑫ 프로세스 회수

```text
브랜치 product-service JAR 18184       회수 완료
VITE_MOCK_MODE=0 Vite 5233             회수 완료
격리 PostgreSQL 55477 / sol1267r2-pg   stop + remove 완료
EcountProductImporterIT Testcontainers  자동 회수 확인
잔여 검증 포트 listener                 0
잔여 격리 컨테이너                      0
공유 samhan-*                           24/24 running
공유 unhealthy                          0
공유 DB write                           0
git add/commit/push                     0
```
