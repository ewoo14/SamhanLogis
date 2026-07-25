# 기획 — #920 CODEF 가져오기 범위: 동시 저장 시 상대 선택 무음 유실

- 이슈: #920
- 브랜치: `fix/920-codef-scope-optimistic-lock`
- 작성: PM(OPUS) 2026-07-25
- 캐논: [feedback_canonical_workflow](../../../.claude/memory/feedback_canonical_workflow.md) · 하네스 5부 [feedback_harness_defect_zero_design](../../../.claude/memory/feedback_harness_defect_zero_design.md)

---

## 1부 · 진단 확증 (실행으로 확인함)

이슈 본문의 재현은 회사PC 에서 CODEX SOL 이 잡은 것입니다. **집PC 실서버에서 독립 재현**해 진단이 살아 있음을 확인했습니다. 공유 실데이터 오염을 피하려고 throwaway `connectedId` 로 격리했습니다.

```
PUT /accounting/codef/scopes  (accounting-service 127.0.0.1:8087, 실 Postgres)
connectedId = qa-920-lostupdate-20260725

0. 초기 저장            → accountRefs=["국민 123456-78-901234"]
1. 두 세션 동일 스냅샷 로드 → 위와 같음
2. 세션 A: 신한 추가 저장  → 200, accountRefs=["국민 …","신한 987654-32-109876"]
3. 세션 B: stale 스냅샷으로 카드만 추가 저장
   → HTTP 200  "가져오기 선택이 저장되었습니다."
   → accountRefs=["국민 123456-78-901234"]      ← 신한이 응답에서 이미 사라짐
4. 최종 재진입 GET
   → accountRefs=["국민 123456-78-901234"], cardRefs=["삼한 법인카드 2222"]
```

**확증된 것**: 세션 B 는 자기가 남의 선택을 지운 사실을 모른 채 성공 토스트를 받고, 세션 A 는 아무 통지도 받지 못하며, 다음 가져오기에서 신한 계좌 거래내역이 조용히 누락됩니다.

**원인(코드)**: `CodefImportScopeRequest` 는 클라이언트가 로드한 목록 전체를 그대로 돌려보내는 **전체 교체(full replacement)** 계약이고, `UserCodefImportScopeService.upsertOnce` 는 받은 배열을 검증 후 verbatim 저장합니다. 요청 어디에도 "내가 무엇을 보고 있었는지"를 나타내는 값이 없어 서버가 stale 여부를 판정할 수단 자체가 없습니다.

**pre-existing 확인** — #877(PR #918)이 만든 것이 아닙니다. #877 은 오히려 손실 범위를 좁혔습니다(이슈 본문 표 참조).

---

## 2부 · 불변식 (구현 수단은 지시하지 않습니다)

구현자는 아래 불변식을 만족시키는 **수단을 스스로 선택**하십시오. PM 이 수단을 지시하면 그 수단이 낳는 결함까지 PM 이 떠안게 되므로 지시하지 않습니다.

| # | 불변식 |
|---|---|
| **I1** | 화면을 연 이후 **다른 세션이 저장한 변경을 반영하지 않은 채** 저장하면 그 저장은 **성사되지 않는다**. 서버가 거부하고, 사용자는 거부됐다는 사실과 이유를 안다. |
| **I2** | 거부는 **데이터를 전혀 바꾸지 않은 채** 일어난다. 부분 반영이 없다. |
| **I3** | 거부된 사용자는 **막다른 길에 놓이지 않는다** — 지금 서버에 무엇이 저장돼 있는지 보고, 거기서 자기 의도를 관철할 경로가 화면에 있다. |
| **I4** | **첫 저장(미저장 상태)** 도 같은 규칙을 따른다. 두 세션이 동시에 첫 저장을 시도하면 나중 것이 상대를 무음으로 덮지 않는다. |
| **I5** | 이미 저장된 기존 행은 변경 후에도 그대로 조회·저장된다(하위호환) — **단, 요청이 `version`을 보내는 클라이언트에 한한다.** `version`을 모르는 구버전 데스크톱(#920 이전 빌드)이 기존 행에 PUT하면 요청에 `version` 필드 자체가 없어 현재 버전(0)과 불일치로 간주되어 **항상** 409로 거부된다(영구, 업그레이드 전까지 — `UserCodefImportScopeService.verifyVersion`의 `requestedVersion == null` 분기는 의도된 계약이며 바꾸지 않는다). 개발책임자 결정(2026-07-25): 이 비호환 창은 배포 순서로 없앤다 — ① 데스크톱 forceLevel=CRITICAL 강제 업데이트(비해제 차단 모달 — `clients/desktop/src/renderer/version/versionCheck.ts:62-63`의 `forceLevel==='CRITICAL'` → `kind:'blocking'` 경로) 선행 → ② 그 뒤에만 accounting-service를 배포한다. 이 순서를 지키면 구버전이 이 409를 만날 창이 없다. |
| **I6** | 정상 단일 사용자 흐름에 **마찰이 늘지 않는다** — 저장 직후 같은 화면에서 다시 저장할 수 있어야 한다(잠금 값이 저장 응답으로 갱신되지 않으면 두 번째 저장이 자기 자신과 충돌한다). |

### 📌 PM 결정 — 자동 병합은 채택하지 않습니다

이슈 본문은 "병합/덮어쓰기 선택"을 제안하지만, 집합 자동 병합(합집합)은 **사용자가 의도적으로 해제한 항목을 되살립니다**. 그건 이 이슈가 없애려는 것과 같은 계열의 새 무음 결함입니다. 따라서 **자동 병합 없이**, 서버 최신 상태를 보여주고 사용자가 명시적으로 선택하게 합니다. 병합이 필요하면 사용자가 화면에서 직접 조정합니다.

### 참고 — 이 레포의 기존 관례 (강제 아님)

같은 문제를 이미 푼 곳이 있습니다. 채택 여부는 구현자 판단입니다.
- `services/slip-service/.../SalesSlipUpdateService.java` — 요청이 스냅샷 시각을 싣고 `verifyVersion` 이 대조, 불일치 시 409 `SLIP_OPTIMISTIC_LOCK_CONFLICT`
- `ErrorCode` 에 `PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT` · `SLIP_OPTIMISTIC_LOCK_CONFLICT` 선례 존재
- accounting-service 다수 엔티티가 `@Version` 사용 (`Journal` · `CashReceipt` · `DailyClosing` 등)
- ⚠️ `UserCodefImportScope` 가 상속하는 `BaseEntity` 에는 `@Version` 이 **없습니다**(7 audit 필드만). 새로 넣는다면 Flyway 마이그레이션이 필요하고, **적용된 마이그레이션은 불변**이므로 신규 V 파일만 추가하십시오.

---

## 3부 · 범위 동결

**포함**
- `PUT /accounting/codef/scopes` 저장 경로와 그 응답/조회 계약
- `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.tsx` 및 그 화면의 충돌 안내
- 필요한 Flyway 신규 마이그레이션 · desktop mock 파리티

**제외 (발견해도 이 PR 에서 고치지 않음)**
- 같은 last-write-wins 형태를 가진 **다른 사용자 설정 저장 경로**. 발견하면 **목록만 PR 코멘트로 기록**하십시오. 🚫 **새 이슈 등록 금지**(개발책임자 사전 허락 사항).
- CODEF → 바로빌 전환(#922). 기존 CODEF 배선은 현행 유지·결함은 계속 fix 가 방침이므로 이 슬라이스는 유효합니다.

---

## 4부 · 회귀 울타리 — 표면을 명시합니다

"테스트를 추가했다"가 아니라 **어느 표면이 RED 로 잡히는지**를 명시하십시오. 표면을 적지 않은 울타리는 거짓 green 을 낳습니다(#907 F-2 실측).

| 표면 | 울타리가 잡아야 하는 것 |
|---|---|
| BE 동시 저장 | stale 스냅샷 저장 → 거부, **그리고 DB 가 A 의 저장 상태 그대로** (거부만 확인하고 데이터 불변을 확인하지 않으면 I2 미검증) |
| BE 첫 저장 경쟁 | 두 세션이 미저장 상태에서 동시 첫 저장 → 나중 것이 무음으로 덮지 않음 |
| BE 연속 저장 | 저장 → 같은 화면에서 재저장이 **성공**(I6 — 자기 자신과 충돌하지 않음) |
| BE 하위호환 | 기존 행(마이그레이션 이전 저장분) 조회 → 저장이 정상 성사 |
| FE 충돌 화면 | 거부 응답 수신 시 사용자가 서버 최신 상태를 보고 다음 행동을 할 수 있음 |
| FE 정상 회귀 | 단일 사용자 저장/재진입이 기존과 동일하게 동작 |
| mock 파리티 | desktop mock 이 거부 응답을 실 BE 와 같은 형태로 재현 (mock 에서만 통과하는 화면 금지) |

🚨 **RED-first**: 결함을 재현하는 실패 테스트를 **먼저** 쓰고 **RED 출력 원문을 제출한 뒤** 고치십시오. fix 뒤에 쓴 테스트는 "구현자가 고른 fix"만 검증하고 결함 표면 전체는 미검증으로 남습니다.

---

## 5부 · U-gate (효용 게이트)

머지 직전 **실데이터로 1회 실행**해 확인할 한 문장:

> 두 사람이 같은 CODEF 가져오기 범위 화면을 열고 각자 다른 계좌를 추가해 저장했을 때, **누구의 선택도 모르게 사라지지 않는다** — 나중 저장자는 충돌을 통지받고, 화면에서 상대의 변경을 확인한 뒤 자기 의도를 관철할 수 있다.

⚠️ 라이브QA 환경 주의 — accounting-service 를 직접 호출하면 `accounting.bank-matching` 동적 권한이 deny 됩니다. **실 사용자 경로(게이트웨이 :8080 + dev_master 실로그인 + mock OFF)** 로 하십시오. 공유 실 CODEF 설정에 write 하지 말고 throwaway `connectedId` 를 쓰십시오.

---

## 6부 · 동반 의무

- 한국어 커밋/PR
- `docs/dev-reports/` 누적 · README·ROADMAP·DECISIONS·각 README 동기화 · `docs/samhan-public-overview.html` 동기화
- 라이브QA 스크린샷은 **매 라운드** 실캡처(합성 금지) — 사용자 채팅 인라인 + PR SHA-pinned 양쪽
- 사용자에게 UUID 노출 금지 — 충돌 안내에 내부 식별자를 쓰지 말고 사용자 표시값(계좌/카드 표시명)으로 말할 것
