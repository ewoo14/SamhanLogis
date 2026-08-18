# PR #1267 CODEX SOL 적대검증 보고서

> **검증 PR SHA:** `e0d8f9198d9669bb3b351f43af83ac23ab78957e`  
> **main 병합 기준:** `origin/main` `82aa3b950f5beb5c166b0f8fc15ad8654f950179`  
> **병합 후 로컬 검증 SHA:** `abf37a66b206db28b00b15d4cbe241f2282852d8`  
> **검증일:** 2026-08-18 KST  
> **유일 질문:** 실 사용자가 화면을 통해 재현할 수 있는 결함이 있는가

## ① 검증 SHA·main 병합

검증 시작 전 `git log --oneline -8`의 선두는 다음과 같았다.

```text
e0d8f9198 docs(qa): 정찰·검증 산출물 보존
c2841885d Merge remote-tracking branch 'origin/main' into fix/partner-master-and-importer
61e86641e memory: cd 복합 명령은 모드와 무관하게 항상 권한창 — git -C·절대경로로
8f5802c2f memory: UUID 캐논은 표시 금지이고 wire 는 허용 · 공유 컨테이너 404 는 배포본 나이
36bdd6153 [FIX] 거래처 UUID 체계 통일 + 기초품목 동명 차단 (#1259 P2-01·P2-02)
f3fbcae16 chore: 트랙 개설 — 거래처 마스터 2벌 + importer 동명품목 (P2-01·P2-02)
d0250cd0e [FEAT] GAS 파리티 배치 1 — 주문서웹 Ⓐ 6건 (VAT 반올림 · 세트 배분가 포함) (#1241)
777fb9bbd [FIX] 「변동단가」 옵션 정본화 — 명칭·기본값·의미 (#1259) (#1263)
```

`git fetch origin main` 후 `git merge origin/main --no-edit`를 실행했다. 충돌은 없었고 병합 후 로컬 HEAD는 `abf37a66b206db28b00b15d4cbe241f2282852d8`이다. `git add/commit/push`는 실행하지 않았다. 위 병합 커밋은 개발책임자가 시작 조건으로 명시한 `git merge`가 생성한 것이다.

검증 종료 직전 공유 git ref의 `origin/main`은 다른 세션의 fetch로 `b9d9ab16d447ade3ae548acbf42da2b13f805cc0`까지 전진했다. 최초 병합 뒤 추가된 것은 메모리 1파일과 정찰 보고서 1파일뿐이며 PR 대상 서비스·클라이언트 코드는 0파일이다. 검증 SHA를 바꾸지 않기 위해 재병합하지 않았고, 대상 코드 대비는 그대로다.

## ② 404 재현 결과

병합 HEAD에서 `partner-service`를 새 `bootJar`로 만들고 격리 `partner_db`에 연결해 `18195`에서 기동했다. 공유 auth 로그인 200 뒤 `resolveQaCredential()`로 얻은 attestation과 실제 로그인 claim의 사용자 헤더를 주입했다.

| 경로 | 브랜치 JAR 결과 | 화면 도달성 |
|---|---:|---|
| `GET /api/v1/partners/2568700899` | **404 NOT_FOUND** | 현행 클라이언트 호출자 0곳 |
| `GET /admin/partners/2568700899` | **200**, 기존 행 반환 | 직원 거래처 조회 계약 정상 |
| dc-config `GET /partners/2568700899` | **200**, 기존 행 반환 | public 축소 응답 정상 |

404는 사라지지 않았다. 원인은 gateway가 `/api/v1/partners/**`를 partner-service로 보내지만 partner-service에 정확한 단건 매핑이 없기 때문이다. order-app의 `getCustomerData` handler는 여전히 이 경로를 가리키지만 저장소 전체에서 handler 정의 외 호출자가 없다. 현재 화면이 실제로 밟는 `/full`, `/price-discount`, `/shipping-addresses`, `/contacts`, `/revisions` 경로와는 다르다.

따라서 **브랜치 JAR에서 404 자체는 1/1 재현했으나, 실 사용자 화면에서 누를 수 있는 현행 경로는 확인되지 않았다. 도달 결함으로 세지 않는다.**

## ③ 마스터 2벌 처리와 조인 키·채움률·미대응 건수

구현은 한쪽 마스터로 합치거나 런타임 조인한 것이 아니다. 두 `partners` 테이블을 그대로 유지하면서 dc-config V6의 고정 snapshot 211행으로 dc-config 쪽 PK와 참조 FK를 partner-service UUID에 맞춘다.

```text
유지되는 테이블     dc_config_db.partners + partner_db.partners (2벌 유지)
매핑 확인 키        old UUID + partner_code + biz_no
치환 대상값         snapshot에 고정된 partner-service UUID
런타임 cross-DB join 없음
```

공유 DB 읽기 전용 실측:

| 항목 | 수치 |
|---|---:|
| dc-config 미삭제 partners | 211 |
| dc-config `partner_code` 채움 | 211/211 (100%) |
| dc-config `biz_no` 채움 | 211/211 (100%) |
| partner-service 미삭제 partners | 7,310 |
| partner-service `partner_code` 채움 | 7,310/7,310 (100%) |
| partner-service 숫자 사업자번호 채움 | 7,302/7,310 |
| dc-config 211행의 코드 일치 | 211/211 |
| dc-config 211행의 사업자번호 일치 | 211/211 |
| 코드+사업자번호 유일 대응 | 211/211 |
| V6 전 UUID 일치 | 0/211 |
| 코드+사업자번호 미대응 | **0** |
| 코드+사업자번호 모호 대응 | **0** |

V6 SQL snapshot 자체도 211행, old/new UUID 각각 211개 유일, 코드·사업자번호 211/211 채움이다. 현재 partner-service와 대조했을 때 업무키 211/211 일치, snapshot의 new UUID 불일치 0, 미대응 0이었다.

공유 DB 복제본에 브랜치 `dc-config-service.jar`를 실제 기동해 V6를 적용한 사후 결과:

```text
Flyway V6 success             1
업무키 대응                   211/211
UUID 대응                     211/211
미대응                        0
dc_configs 고아               0
dc_rules 고아                 0
price_calculation_logs 고아   0
```

즉 211행은 모두 대응하지만 **마스터 2벌 자체는 남아 있고 snapshot 방식이라 이후 partner-service 신규·변경 행을 자동 수렴시키지는 않는다.** 이 사실만으로 현재 화면 도달 결함을 확인하지는 못했다.

## ④ 동명 품목 화면 구분·276행 위반 처리

공유 DB 재계수 결과는 다음과 같다.

| 지표 | 현재 수치 |
|---|---:|
| 활성 동일 이름 | 156그룹·583행 |
| 견적 노출 안의 동일 이름 | 68그룹·242행 |
| 서로 다른 `product_code`인 활성 동명 | 98그룹·374행 |
| 이름 유니크화를 위해 줄여야 할 초과행 | **276행** |

정찰의 전체 활성 587행보다 현재 4행 적지만, PR 판단의 핵심인 서로 다른 코드 동명 98그룹·374행·초과 276행은 그대로다.

PR은 DB 이름 유니크 제약을 추가하지 않았다. 따라서 기존 276행은 삭제·병합·저장불가 상태로 바뀌지 않고 계속 조회된다. 신규 importer upsert 직전에 활성 동일 이름의 다른 코드가 있으면 409를 반환한다.

브랜치 `product-service.jar` 실호출:

```text
기존 동명 검색       "Y형 분기관" 5행 / HTTP 200
반환 사용자 코드     AXJ-YA2812M · AXJ-YA2815M · AXJ-YA3419M · AXJ-YA4119M · AXJ-YA4422M
신규 동명 import      QA-1267-DUP / "Y형 분기관" → HTTP 409 CONFLICT
실패 행 저장          0행
기존 초과행           276행 유지
```

정적 화면 계약상 기초품목·견적품목 표는 `모델명`과 `품목명`을 별도 열로 표시하고, 위 5행의 `modelCode`는 `product_code`와 같다. 검색 모달은 `모델명/품목명/규격/단가` 열을 사용한다. 동명 374행 중 비어 있지 않은 `product_code` 364행은 모두 `modelName/modelCode`와 일치했고, 10행은 `product_code`가 비어 있으나 `modelName/modelCode`는 채워져 있었다.

다만 브라우저 런타임이 빈 목록을 반환해 실제 화면을 열고 행을 눈으로 확인하지 못했다. 따라서 **화면 구분 축은 미검증이며 결함 0으로 세지 않는다.**

## ⑤ UUID 표시 노출

브랜치 JAR의 기존 거래처 admin/public 응답 원문에는 UUID 문자열이 없었다. 품목 카탈로그 응답은 사용자 표시 필드만 반환했고 UUID 문자열은 없었다. 검색 응답의 내부 `id/categoryId`는 22자 opaque 값이며 화면 코드상 선택 key로만 사용한다.

소스상 기초품목·견적품목 표는 `modelCode/name`을 표시하고 내부 id를 열·tooltip·placeholder로 출력하지 않는다. `ProductAutocomplete`도 id를 key로만 쓰고 옵션/모달에는 모델명·품목명·규격·단가만 렌더링한다.

라벨·tooltip·placeholder·인쇄를 실제 화면에서 전수 확인하는 축은 브라우저 런타임 부재로 **미검증**이다.

## ⑥ 기존 행 호환

새 QA 데이터만으로 판정하지 않았다.

| 기존 행 | 브랜치 JAR 결과 |
|---|---:|
| 기존 거래처 코드 `2568700899`, partner admin | 200 |
| 같은 기존 거래처, dc public | 200 |
| 기존 동명 품목 `Y형 분기관` | 5행 / 200 |
| V6 후 dc-config 기존 partners | 211행 유지 |
| V6 후 기존 dc_configs 참조 | 211행, 고아 0 |
| 기존 동명 초과행 | 276행 유지·조회 가능 |

기존 거래처·품목 조회의 API 호환은 확인했다. 실제 화면 호환은 미검증이다.

## ⑦ 스크린샷(행 수·경로)

```text
resolveQaShotsDir() 결과
C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-sol-merge-verdict\playwright\screenshots\_local

생성 PNG      0장
화면 DOM 행 수 미측정
API 실측 행 수 기존 동명 5행
```

브라우저 플러그인 연결 후 `agent.browsers.list()`가 `[]`를 반환했다. 증거 무결성 예외에 따라 로그인 화면·0행 화면·정적 mock 캡처를 실제 화면 증거로 대체하지 않았다.

## ⑧ 미검증 축

- 브랜치 JAR 데이터를 실제 기초품목/견적품목 화면에서 검색한 DOM 행 수
- 동명 후보 dropdown 및 검색 모달의 실제 코드 열·선택 동작
- 화면 라벨·목록·tooltip·placeholder·인쇄의 UUID 전수 노출 여부
- order-app 화면에서 죽은 `getCustomerData` handler를 호출하는 실제 클릭 동작: 현행 호출자가 없어 화면 경로를 구성할 수 없었음

위 축은 도달 결함 0에 포함하지 않았다.

## ⑨ CI 귀속

PR #1267의 현재 check를 직접 확인했다.

```text
실패 job   빌드 + 테스트 (user+product+inventory+logging)
결과       1,849 tests · 1,842 passed · 5 skipped · 2 failed
실패 1     EcountProductImporterIT — AR-EH03 / SAR-00006
실패 2     EcountProductImporterIT — DET984MERGE 동명 품목
원인       이번 PR의 신규 이름 충돌 가드가 기존 관계/결정적 병합 IT를 409로 중단
```

이는 `Set up job` 실패가 아니다. PR 코드 실행까지 도달한 뒤 정확히 변경 서비스의 IT 2건이 실패했다.

main 대조:

- PR base 시점 main run `32043555698`의 같은 job 실패는 `actions/setup-java` 다운로드 429로, GitHub 장애에 귀속된다.
- 이후 main SHA `ba1271b97af7fbd9d7590db2baba616193bbcc4a` run `32077751591`에서 같은 `user+product+inventory+logging` job은 성공했다.
- PR run의 slip 관련 job은 모두 성공해 알려진 `SlipSalesUpdateIT R9` 실패와 무관하다.

따라서 **현재 PR의 CI 2실패는 PR 귀속**이다.

## ⑩ 머지 가능/불가 — 도달 결함 N건

## **머지 불가 — 화면 도달 결함 0건 확정, 화면 미검증 축 존재, PR 귀속 CI 실패 2건**

- 404는 브랜치 JAR에서 남아 있으나 현행 화면 호출자가 없어 도달 결함으로 세지 않았다.
- 기존 거래처·동명 품목 API 조회는 정상이고 UUID 문자열 노출도 API에서는 없었다.
- 실제 화면 검증을 수행하지 못했으므로 도달 결함 0은 “전체 화면 무결함”을 뜻하지 않는다.
- 무엇보다 PR 변경이 기존 `EcountProductImporterIT` 두 계약을 깨뜨려 CI가 red다. 현재 상태로는 머지할 수 없다.

## ⑪ 프로세스 회수

```text
기동 JAR              product 18184 · dc-config 18189 · partner 18195
기동 화면 서버         Vite 15167
격리 컨테이너          sol1267-pg

회수 후 대상 포트      0개 listen
회수 후 sol1267-pg     0개
공유 samhan-*          24/24 running · 24/24 healthy
공유 컨테이너 조작     0건
공유 DB write          0건
다른 검증 컨테이너     codex1266-r4-pg · sol1265r2-pg · sol1270-pg 그대로
git add/commit/push     0건
```

검증용 DB write는 `sol1267-pg` 복제본에만 수행했다. 공유 24개 컨테이너와 다른 워크트리·다른 검증 컨테이너는 중지·재시작·변경하지 않았다.
