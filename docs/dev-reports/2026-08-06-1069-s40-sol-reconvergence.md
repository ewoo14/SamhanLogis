# #1069 S40 SOL 재수렴 보고서 — PR #1077

대상 HEAD: `d4668ee8d2daffe175e6c9ee00edf96eaf023a62`  
역할: 2차 적대검증자(SOL)  
검증 원칙: 실 사용자 경로로 재현 가능한 결함만 판정하고, 소스 게이트의 한계 자체는 결함으로 집계하지 않는다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함은 0건이다. 코드 결함 관점에서 현 HEAD의 머지를 권고한다.**

S38의 두 결함은 S39에서 닫혔다.

- 전표 EXPAND 옵션 5개와 `setHead`/`parentSetModel`은 저장·상세 응답·전체수정 계보 승계·서버 복사·revision 캡처/복원에서 보존된다.
- 견적 BUNDLE 옵션은 생성/수정 시 `estimate_lines.bundle_set_options`에 저장되고, 상세 응답·편집 hydrate·revision 캡처/복원·견적→전표 변환까지 전달된다.
- KEEP 부모와 일반 SINGLE의 정상 UI 저장에는 허위 옵션/계보가 붙지 않는다. 기존 null 행과 옵션 키가 없는 구 snapshot은 null로 하위호환된다.

남은 머지 게이트는 이 판정과 별개다. `gh pr checks 1077`에서 현재 확인되는 것은 `GitGuardian Security Checks pass`뿐이므로 **전체 CI green은 아직 확인되지 않았다.** 또한 이 트랙은 **머지 전 라이브 QA 미실시**다. 전체 CI green과 머지 전 라이브 QA를 완료한 뒤 머지해야 한다.

## 2. 계약 테스트 검출 범위 재측정

S39 보고서가 적은 간접 메서드 참조·람다·상속/위임·reflection·생성자 별칭·생성 코드·같은 파일의 무관한 운반 표식은 실제 한계다. 전수 검색 결과, 보고서에 빠진 구체적인 미탐지 형태도 확인했다.

1. `SlipLine.java`와 `EstimateLine.java` 내부 팩토리는 `SlipLine.create(...)` 같은 정규식 형태가 아니라 비정규화된 `new SlipLine(...)`/`new EstimateLine(...)`을 사용한다. 실제 게이트 정규식을 같은 전처리 결과에 적용하면 두 파일 모두 `MATCH=false`다. 따라서 게이트 안의 `SlipLine.java` 전용 `copyOf` 옵션 단언 분기는 현재 도달하지 않는 죽은 분기다.
2. `addLine` 탐지는 수신자 이름이 소문자 `slip`으로 고정돼 있다. `estimate.addLine(...)`, 별칭 수신자, `this.lines.add(...)`/`addAll(...)`은 그 형태만으로는 검출하지 못한다.
3. `SlipPublishService`의 세 사용자 발행 경로는 `resolved.toEntityLines(slip)`이라는 간접 생산을 거친다. 파일 안쪽의 정적 팩토리 호출과 정책 표식 하나 때문에 파일 전체가 통과하지만, 게이트는 세 호출과 정책 판정을 경로별로 연결하지 않는다.
4. 정적 import 된 팩토리, 새 factory 이름, repository/entity manager 직접 영속화도 현재 패턴 밖이다.

그러나 이 미탐지 형태에서 살아 있는 실 사용자 결함은 찾지 못했다.

- `SlipLine.copyOf`는 `parentSetModel`, `setHead`, `bundleSetOptions`를 원본에서 직접 복사한다. `SlipDuplicateService`는 이 메서드만 사용한다.
- `SlipLine`/`EstimateLine`의 일반 팩토리는 옵션을 추측 생성하지 않고 null로 시작한다. EXPAND/BUNDLE 사용자 경로의 호출자가 `assignBundleComponent(..., options)`로 문맥을 부여한다.
- `SlipPublishService`는 세 발행 경로가 공유하는 `resolveLines`에서 `BundleModePolicy.shouldExpand`로 EXPAND/NULL BUNDLE 부모를 먼저 거부한 뒤 라인을 만든다. 이 DTO에는 사용자가 선택한 BUNDLE 옵션/계보 입력 자체가 없다.
- 모바일 견적은 옵션 필드가 없는 간소 DTO이며 `expand(..., null, ...)` 계약으로 기본 옵션을 사용한다. 저장 계보는 남고, 사용자가 선택한 옵션을 잃는 경로는 아니다.
- JPA cascade는 이미 생성된 라인을 영속할 뿐 별도 생산 입구가 아니다.

즉, S39의 “남은 구멍” 목록은 방향상 정직하지만 위의 죽은 전용 분기·수신자 이름 고정·실제 간접 생산 컨테이너가 누락돼 있었다. 이 라운드 판정 기준에 따라 **검출 범위 한계는 기록하되 결함 수에는 넣지 않았다.**

## 3. 실 DB 기준선과 마이그레이션

애플리케이션 컨테이너는 판정에 사용하지 않았다. `docker inspect -f '{{.Created}}' samhan-slip-service` 결과 생성 시각은 `2026-08-05T21:47:12.463983963Z`였고, 실 `slip_db`에는 다른 트랙의 V113이 적용돼 있었다. 따라서 해당 컨테이너가 이 PR 바이너리라는 전제를 두지 않았다.

PostgreSQL에 SELECT만 수행해 `created_at < 2026-08-06 00:00:00`, 활성 OUTBOUND DRAFT, 현재 활성 제품 정본을 같은 조건으로 재계수했다.

```text
SINGLE                 2,107행 / 2,100전표 / 2,837,681,781.00원
활성 BUNDLE 교차       0행
BundleProductGuard 적중 0행
활성 BUNDLE 정본       EXPAND 343 · bundle_mode NULL 1 · KEEP 0
```

번호도 재확인했다.

- `origin/main` slip-service 최고: V112
- 열린 PR #1078 head `a26164d0c` 파일: `V113__add_estimate_specification_source.sql`
- 이 PR: `V114__preserve_bundle_set_options.sql`, `V115__preserve_estimate_bundle_set_options.sql`
- 현재 브랜치 안 중복 migration 번호: 없음

V114/V115는 각각 `slip_lines`/`estimate_lines`에 nullable JSONB 컬럼만 `ADD COLUMN IF NOT EXISTS`로 추가한다. default와 backfill이 없으므로 기존 행은 null이다. fresh Testcontainers 실행에서 Flyway가 71개 migration을 검증하고 스키마 V115까지 올린 뒤 Hibernate `ddl-auto=validate`와 지정 suite가 통과했다. 기존 null은 응답에서 null, FE hydrate에서 빈 편집 기본값으로 처리되며 인쇄 경로는 이 필드를 소비하지 않는다.

## 4. 옵션 문맥 왕복과 반대급부

코드 경계와 실행 테스트를 함께 대조했다.

- 전표 저장/재조회: `SlipLine.bundleSetOptions` JSONB → `SlipLineResponse.setOptions`.
- 전표 전체수정: 기존 lineId로 `BundleLineageResolver`가 옵션 5개와 `setHead`/`parentSetModel`을 새 라인에 복원한다. 매출/매입 두 서비스가 같은 resolver를 사용한다.
- 전표 복사: `SlipLine.copyOf`가 옵션·계보를 직접 대입한다.
- 전표 revision: `Slip.toSnapshot()`이 옵션을 캡처하고 `restoreFromSnapshot()`이 세 인자 overload로 복원한다.
- 견적 저장/재조회: `EstimateService`가 전개된 모든 구성품에 선택 옵션을 부여하고 `EstimateLineResponse.setOptions`가 반환한다. 편집 hydrate는 응답 옵션을 사용한다.
- 견적 수정: 기존 구성품은 lineId resolver로 저장 옵션과 계보를 승계한다.
- 견적 revision: `Estimate.toSnapshot()`/`restoreFromSnapshot()`이 같은 문맥을 보존한다.
- 견적→전표: `EstimateToSlipConverter`가 `EstimateLine.getBundleSetOptions()`를 전표 라인에 전달한다.

반대급부도 확인했다.

- `BundleModePolicy`는 BUNDLE이면서 mode가 KEEP이 아닐 때만 전개한다. KEEP은 일반 분기로 가며 정상 FE payload는 자기 계보/옵션을 보내지 않는다.
- 일반 SINGLE은 Playwright 저장 payload에서 `setOptions` 키가 제거된다. 서버 일반 분기도 옵션을 부여하지 않는다.
- 구 snapshot의 옵션 키 없음은 null로 역직렬화된다.
- V114/V115 이전 행은 backfill하지 않는다.

## 5. 증거 무결성, 새 파일, 안 본 범위

fresh 재현 결과:

```text
프런트 typecheck                                      exit 0
Vitest 지정 3파일                                    225/225
Playwright bundle-set-options                        9/9 · exit 0
좁은 옵션/계보/revision/모바일 백엔드 묶음           BUILD SUCCESSFUL in 58s
S39 지정 백엔드 suite --rerun-tasks                  BUILD SUCCESSFUL in 2m 6s
실 DB read-only 기준선                                2,107 / 2,100 / 2,837,681,781.00 · 가드 0
```

Playwright는 `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`, 전용 Vite `127.0.0.1:5177`, `PLAYWRIGHT_SKIP_WEB_SERVER=1`로 실행했다. 따라서 로컬 API 서버 성공에 기대지 않았다. 첫 실행은 테스트 자체가 9/9였으나 래퍼 정리 단계 exit 1과 열린 임시 파일이 남아 증거에서 폐기했다. 포트와 임시 파일을 정리한 뒤, Playwright 자식 프로세스 exit code를 직접 읽는 두 번째 실행에서 `PLAYWRIGHT_EXIT=0`, `9 passed (11.4s)`를 확정했다. 5177 listener와 `%TEMP%` 출력 파일은 모두 제거했다.

새 파일:

- `docs/dev-reports/2026-08-06-1069-s40-sol-reconvergence.md` (본 보고서)

코드 수정, git add/commit/push/merge, DB write, Docker 재빌드·재배포·중지, 저장소 QA driver/QA 디렉터리, `.log`, 로그인 응답/토큰 원문은 만들거나 수행하지 않았다.

안 본 범위:

- 머지 전 라이브 QA와 실제 사용자 GUI 클릭 저장/재조회
- 이 PR 바이너리를 배포한 실제 HTTP/DB write 왕복
- 전체 저장소 CI와 전체 Gradle/전체 Playwright
- 실제 모바일 기기 GUI, 외부 vendor 발송
- 다른 트랙 #1066, #1075, #1051, #1052의 구현 파일
- #1078의 구현 내용(파일 목록과 V113 번호만 확인)
