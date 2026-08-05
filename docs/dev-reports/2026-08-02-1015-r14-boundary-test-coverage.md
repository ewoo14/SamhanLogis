# PR #1060 / 이슈 #1015 R14 — 주문서 앱 접근권한 경계 검증 커버리지

## 결론

R13에서 확인한 구현식은 변경하지 않고 테스트만 추가·정정했다. 레거시 strict `<` 계약에 따라 정확히 30일은 활성, 30일+1초부터 만료임을 세 경로에서 실제 서비스 호출로 확인했다.

## 1. 9칸 경계 실행 결과

테스트: `PartnerAuthServiceAccessSetTest.boundaryMatrixUsesLegacyStrictBeforeForPreviewAuthenticationAndExpirationApi`

| 기준 경과 | 미리보기 실제 호출 | 실제 인증 차단 실제 호출 | 만료 API `getExpiration` 실제 호출 |
|---|---:|---:|---:|
| 29일 | 활성 / 후보 0건 | `NEED_PW_INPUT` | `expiredAlready=false` |
| 정확히 30일 | 활성 / 후보 0건 | `NEED_PW_INPUT` | `expiredAlready=false` |
| 30일+1초 | 만료 / 후보 1건 | `LONG_UNUSED` | `expiredAlready=true` |

고정된 `LocalDateTime.of(2026, 8, 3, 0, 0)`을 현재 시각으로 주입하고 `createdAt`을 초 단위로 계산했으므로 CI 타임존에 의존하지 않는다. Gradle 전체 `partner-auth-service` 테스트가 `BUILD SUCCESSFUL`로 통과했으며, 신규 9칸 테스트는 각 행에서 세 경로를 모두 호출한다.

## 2. 보류 UI 실제 렌더 테스트

신규 [SalesOrderApprovalsPage.test.tsx](../../clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.test.tsx)는 `/access-preview/report` 계약 응답을 React Query에 주입하고 실제 `SalesOrderApprovalsPage`를 jsdom 렌더한다.

- `deferredPartnerCount=2` → `2건의 판정이 보류되었습니다.` 표시
- `deferredSources=['ORDER', 'SHIPMENT']` → `(ORDER, SHIPMENT)` 표시
- 실행 결과: `1 test passed`

## 3. 정정한 낡은 테스트 설명

현재 규칙과 맞지 않던 `lastLoginAt + 30일` 설명과 그 설명을 지지하는 불필요한 `lastLoginAt` 설정을 함께 제거했다.

| 파일:줄 | 정정 |
|---|---|
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceTest.java:520-521` | `생성시각 + 30일 = expiresAt`, 메서드명도 `생성시각기준`으로 변경. 단정은 실제 `createdAt + 30일` 기준에 맞춤 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/it/PartnerAuthControllerIT.java:222` | 테스트명 `GET_partner_expiration_생성시각기준_30일`로 변경 |

`rg`로 `lastLoginAt + 30일` 및 동등한 낡은 설명을 다시 검색해 잔존하지 않음을 확인했다.

## 4. 불변식 실측

| 불변식 | 실측 결과 |
|---|---|
| 1. 세 항목 완료 | 9칸 경계 테스트, 보류 UI 렌더 테스트, 낡은 설명 정정 완료 |
| 2. 구현 불변 | `services/partner-auth-service/src/main` 및 `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx` 변경 없음. 테스트 파일과 본 보고서만 변경 |
| 3. 기존 성과 유지 | 보류 노출 경로는 기존 `deferred/deferredPartnerCount/deferredSources` 계약을 그대로 렌더. DTO 하위호환·로그인 비면제·잘못 차단 0·대칭 차집합 0 관련 기존 구현은 변경하지 않음. `mock.test.ts` 기존 129/129 통과 |
| 4. 전체 게이트 | `partner-auth-service` Gradle 전체 `BUILD SUCCESSFUL`; mock `129 tests passed`; 신규 UI `1 test passed`; desktop `tsconfig.node.json`·`tsconfig.web.json` typecheck 모두 exit 0; `git diff --check` 통과 |

참고로 `npm test` 래퍼 자체는 로컬 파생물 신선도 가드에서 `out/main/index.js` 부재로 중단됐다. 이미지 재빌드 없이 동일 Vitest를 직접 실행해 신규 렌더 테스트와 mock 전체 테스트를 검증했다.

## 5. 파일별 변경량

| 파일 | 변경량 |
|---|---:|
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java` | `+46 / -0` |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceTest.java` | `+2 / -9` |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/it/PartnerAuthControllerIT.java` | `+1 / -1` |
| `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.test.tsx` | `+60 / -0` (새 파일) |
| `docs/dev-reports/2026-08-02-1015-r14-boundary-test-coverage.md` | `+64 / -0` (새 파일) |

## 새 파일 경로 목록

- `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.test.tsx`
- `docs/dev-reports/2026-08-02-1015-r14-boundary-test-coverage.md`

커밋·push·checkout·브랜치 조작·공유 DB write/DDL·Docker 이미지 재빌드는 수행하지 않았다.
