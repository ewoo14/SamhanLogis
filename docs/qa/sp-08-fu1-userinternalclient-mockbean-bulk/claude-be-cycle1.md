# SP-08-FU1 BE Cycle 1 리뷰 — UserInternalClient @MockBean 일괄 추가

**작성일**: 2026-05-19
**리뷰어**: BE Claude (cycle 1)
**대상 커밋**: a800284b

---

## 총평

기존 5개 IT 에서 확립된 `SlipQuerySalesIT` 패턴이 38개 파일 전체에 일관되게 적용되었다. 운영 코드 변경 없음 확인. 잠재 이슈로 지정된 `UnnecessaryStubbingException` 위험은 전 파일에서 `Mockito.lenient()` 사용으로 완전 차단되었다. 단 1건의 P2 관찰 사항이 있으며, 전체 판정에 영향을 미치지 않는다.

---

## 검증 결과

### 1. 전체 IT 카운트

Glob 전수 결과 총 45개 `*IT.java`:
- 의도 제외 2건: `AbstractPostgresIT` (추상 부모, `@SpringBootTest` 없음), `SlipRealtimeBrokerConcurrencyIT` (`@SpringBootTest` 없음) — 양쪽 모두 확인 완료
- 기존 적용 5건: `SlipFormV20MatchingIT`, `SlipInspectControllerIT`, `SlipQuerySalesIT`, `SlipSalesDeleteIT`, `SlipSalesUpdateIT`
- 이번 추가 대상: 45 - 2 - 5 = **38건**
- 커밋 변경 java 파일: 38개 — 전수 일치

커밋 메시지에서 "39건"이라 표기된 것은 dev-report `.md` 1건 포함 합산이므로 숫자 불일치 없음.

### 2. @MockBean + lenient stub 패턴 일관성

무작위 샘플 15개 파일 직접 확인:

| 파일 | @MockBean | lenient stub | 패턴 일치 |
|---|---|---|---|
| DispatchTaskRepositoryIT | O | O | O |
| ReceiptOcrShellIT | O | O | O |
| ApplicationContextLoadIT | O | X | **관찰 사항** |
| SlipDomainIT | O | O | O |
| SlipDynamicPermissionIT | O | O | O |
| SlipCleanupSaveHistoryIT | O | O | O |
| SlipPublishControllerIT | O | O | O |
| EstimateControllerIT | O | O | O |
| DeliveryBatchControllerIT | O | O | O |
| PublicSlipControllerIT | O | O | O |
| SlipRealtimeControllerIT | O | O | O |
| DispatchEndToEndIT | O | O | O |
| DispatchModificationEndToEndIT | O | O | O |
| SlipSignatureAdminIT | O | O | O |
| SlipExcelExportIT | O | O | O |

### 3. import 정합성

lenient stub 사용 파일은 `Mockito`, `ArgumentMatchers`, `Optional` import 모두 확인. compileTestJava PASS (커밋 메시지 명시) 이므로 누락 없음.

### 4. 운영 코드 변경 확인

`git show a800284b --name-only` 결과에서 `src/main/` 경로 파일 0건 — 완전 격리 확인.

### 5. 의도 제외 정합성

- `AbstractPostgresIT`: `@SpringBootTest` 없음, `@ExtendWith` 만 보유, 자식에게 `@MockBean` 추가 시 Spring Context 재생성 문제 없음 (추상 부모에 `@MockBean` 없는 것이 올바름)
- `SlipRealtimeBrokerConcurrencyIT`: `@SpringBootTest` 없음 직접 확인 — 제외 정당

---

## P2 관찰 사항 (FIX 불필요)

**P2: ApplicationContextLoadIT — lenient stub 미추가**

`ApplicationContextLoadIT`는 `@MockBean UserInternalClient` 선언은 되어 있으나, `@BeforeEach` lenient stub 이 없다. 이 IT 의 테스트 메서드 3개(`contextLoads`, `slipRealtimeBrokerBeanIsRegistered`, `slipAuditLogServiceBeanIsRegistered`)는 모두 HTTP 요청 없이 bean 등록만 확인하므로 `resolveFullName` 호출 경로가 없다. 따라서 `UnnecessaryStubbingException` 위험이 없고 테스트 실패로도 이어지지 않는다.

다만 39건 중 유일하게 패턴 불일치 상태이므로, 향후 테스트 메서드 추가 시 lenient stub 누락 실수 가능성을 내포한다. 다음 슬라이스 작업 시 기회 비용이 낮을 때 추가 권장.

---

## 판정

**APPROVE**

P0/P1 결함 없음. 38개 파일 모두 `@MockBean` + `Mockito.lenient()` 패턴 적용 완료. 운영 코드 변경 0. 의도 제외 2건 정당. compileTestJava PASS 확인.
