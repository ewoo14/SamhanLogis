# #913 + #890 — 검증품질 이월 분기 배치 (기획)

> 대상 Issue: #913 (#908 DS-4 이월) · #890 (#845 DS-3a 이월)
> 성격: 기획. 착수 전 PM(OPUS) 작성.
> 개발책임자 승인으로 두 이슈를 **한 PR 로 묶는다**(백로그 순감 목적, 새 이슈 만들지 않음).

## 0. 성격 — "검증품질" 이지만 일부는 도달 가능하다

캐논상 검증품질(테스트 약함·가드 구멍·mock 미비)은 머지 게이트가 아니고 분기 chore 배치 대상이다. 다만 아래 **#913-1 은 공유 실 DB 를 오염시키고 동시 실행 시 남의 데이터를 지우므로 도달 가능**하다. 이 배치의 1순위다.

## 1. #913 (DS-4 이월) — 4건

| # | 내용 | 실측 근거 |
|---|---|---|
| **1** 🚨 | `finally` cleanup 이 **타임아웃에서는 동작하지 않는다** → 공유 실 DB 에 throwaway 잔존. 부수로 정리 필터가 `name.startsWith('DS4 실서버QA')` **전체 삭제**라 두 프로세스 동시 실행 시 **서로의 진행 중 양식을 지운다** | `869-ds4-real-qa.spec.ts:163-179` · `ds4-body-layer-regression-real-qa.spec.ts:183-199`. C1(단언실패)은 정리 실행, C2(타임아웃)는 `FINALLY-HTTP` 자체가 없음 |
| **2** | `DocumentRenderer` IMAGE style 제거(B-4 절반)의 **커버가 0** — fix 를 원복해도 전부 GREEN | fix 지점 `DocumentRenderer.tsx:233-238` vs `luna-r6-red-real-qa.spec.ts:72-82`(인스펙터 노출만) · `DocumentRenderer.test.tsx:581-614`(style 미주입, geometry 만) |
| **3** | BE `ImageIO` 실디코딩 분기를 지나는 **자동 테스트 0** | `DocumentPayloadValidatorTest.java:304-314` fixture 가 실 이미지가 아님 |
| **4** | 문서 불일치 | 이슈 본문 |

## 2. #890 (DS-3a 이월) — ①은 제외, ②~⑥

**① 은 이미 충족돼 이월 대상에서 제외한다**(전제 오류) — `.github/workflows/ci.yml:166-171` 이 이미 `tests=0` 을 차단하며, 이는 이슈 등록 시점에 이미 사실이었다.

| # | 내용 | 실측 근거 |
|---|---|---|
| ② | V13 트리거의 `OLD.document_template_default_pinned` disjunct 를 지워도 **GREEN** — 유일한 지킴이가 `document_template_id` NOT NULL 인 행만 위조 | `GroupwareAdminControllerIT.java:396-450` · ACTIVE-0(`:452-488`)은 직접 SQL 철회 미시도 |
| ③ | mock 승인 경로가 `documentTemplateId`/`Revision`/`DefaultPinned` **3필드를 각인하지 않음** → AC 스펙이 pre-seed 로 우회 | `mock.ts:10999-11005` · `ac-845-ds3a-reprint-pin.spec.ts:45-49` |
| ④ | 테스트가 **2-인자**, 공개 경로는 **3-인자** | `ApprovalLineApprovalConflictTest.java:73` vs `GroupwareAdminController.java:146` → `ApprovalLineService.java:288` |
| ⑤ | `no-print` **클래스 문자열 존재만 단언**, print 미디어 실제 소거 미검증 | `ApprovalDocView.test.tsx:187·229·261·285` |
| ⑥ | V13 트리거가 OLD 미pin 이면 통과 → 기존 APPROVED·미pin 행의 **사후 최초 각인**을 허용 | 이슈 본문 |

## 3. 불변식 (수단은 구현자가 정한다)

1. **#913-1 은 "정리가 실행됐다" 가 아니라 "정리가 실패해도 남의 데이터를 지우지 않는다" 까지 만족해야 한다** — 타임아웃·강제 종료·동시 2프로세스 세 경우를 각각 실측할 것.
2. **가드를 고쳤다면 뮤테이션으로 증명한다** — ②·⑥ 은 트리거 disjunct 를 실제로 지운 상태에서 **RED 가 되는지** 확인하고 원문 제출.
3. **mock 파리티는 값 형식까지** — 필드 존재가 아니라 BE 가 실제로 내는 값 형식과 일치할 것.
4. **테스트가 공개 경로와 같은 시그니처를 지나야 한다**(④) — 내부 오버로드만 부르는 테스트는 계약을 검증하지 않는다.
5. **`no-print` 는 실제 print 미디어에서 사라지는 것을 본다**(⑤) — 클래스 문자열 단언으로 대체 금지.
6. **적용된 Flyway 마이그레이션은 수정 금지**(checksum) — 필요하면 신규 V만.

## 4. 범위 밖

- #890 ① (`tests=0` 차단) — 이미 충족
- #913 의 "이미 해소" 로 표시된 항목

## 5. 머지 게이트

① 실 사용자 경로 재현 결함 0 ② CI green(exact SHA) ③ 라이브QA — #913-1 은 **타임아웃·동시 2프로세스 실측**이 라이브QA 증거다
