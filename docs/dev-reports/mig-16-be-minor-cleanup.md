# MIG-16 BE Minor 청소 dev-report

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-16-be-minor-cleanup`
> 기준 문서: `docs/superpowers/specs/2026-05-21-mig-16-be-minor-cleanup-design.md`, `docs/superpowers/plans/2026-05-21-mig-16-be-minor-cleanup.md`

---

## 1. 범위

MIG-16은 MIG-14 사후 Minor 백로그 중 BE 조회 비용과 FE 피드백 문제를 한 번에 정리한다. 신규 도메인 기능은 만들지 않고, admin 조회/권한/피드백 계약을 운영 사용성 기준으로 다듬는다.

| 영역 | 처리 |
|---|---|
| partner-service | `POST /internal/partners/lookup-by-ids` 추가, `ids[] -> partners[].id/name` batch 조회 |
| accounting-service client | `PartnerLookupClient.findByPartnerIdsBatch(List<UUID>) -> Map<UUID, String>` 추가 |
| accounting admin query | CashDisbursement/CashReceipt partnerName N+1 lookup을 batch 1회 호출로 교체 |
| aging snapshot | 정적 `AGING_LIMIT=500`을 `Pageable` 기반 `page/size`로 전환, 기본 100 / 최대 500 |
| desktop | AgingSnapshot refresh 성공/실패 toast와 AppLayout 권한 로딩 중 보수적 deny 적용 |

---

## 2. 구현 메모

- partner-service internal batch endpoint는 기존 internal controller의 `ApiResponse` envelope 패턴을 유지한다. 응답 본문은 `data.partners[].id/name`이며, client 파서는 wrapper 없는 `partners[]`도 허용한다.
- 일부 미존재 partnerId는 실패가 아니라 누락으로 처리한다. 호출 측은 반환 Map 기준으로 이름을 채우며, 미조회 행은 기존처럼 null 표시를 유지한다.
- `/api/v1/accounting/aging-snapshot`은 `Page<PartnerAgingSnapshotResponse>`를 반환한다. FE client는 기존 배열 응답 fallback도 유지해 mock/구버전 응답과 호환된다.
- `usePermissions().canAccess()`는 캐시 미로드 시 `false`를 반환한다. MIG-14 admin 메뉴는 권한 조회 완료 전 표시되지 않는다.

---

## 3. 테스트/가드

| 테스트 | 커버 |
|---|---|
| `PartnerInternalControllerIT` | lookup-by-ids 정상 / 빈 결과 / 토큰 누락 / 일부 미존재 |
| `PartnerLookupClientTest` | batch POST 1회 호출, 401 fail-fast |
| `AccountingAdminQueryServiceTest` | N=50 cash row partnerName batch 1회, aging size 500 clamp + offset |
| `AccountingAdminQueryControllerIT` | `/aging-snapshot?page&size` controller clamp |

검증 메모:

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
./gradlew :services:accounting-service:compileTestJava :services:partner-service:compileTestJava --no-daemon
```

결과: `BUILD SUCCESSFUL` (compile/test source 검증). 기본 `./gradlew`는 wrapper distribution 다운로드를 시도해 sandbox 네트워크 차단에 걸리므로, 캐시된 Gradle home을 명시해야 한다.

---

## 4. 문서 동기화

- `migration/decisions/DECISIONS.md`: D-MIG-16-01~06 추가
- `docs/handoff/CURRENT-WORK.md`: MIG-16 최신 진행 블록 추가
- `docs/samhan-public-overview.html`: nav badge와 Phase 10.6 callout 갱신
- `README.md`, `ROADMAP.md`: 최신 진행 메모에 MIG-16 추가
