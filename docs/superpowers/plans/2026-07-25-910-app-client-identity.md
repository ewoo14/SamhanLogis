# 기획 — #910 슬라이스 1: 앱 식별 오폭 차단

- 이슈: #910 (전 사용자 대면 클라이언트 버전 정책 확대)
- 브랜치: `feat/910-app-client-identity`
- 작성: PM(OPUS) 2026-07-25
- 캐논: [feedback_canonical_workflow](../../../.claude/memory/feedback_canonical_workflow.md) · 하네스 5부 [feedback_harness_defect_zero_design](../../../.claude/memory/feedback_harness_defect_zero_design.md)

---

## 1부 · 진단 확증 (실행으로 확인함)

이슈 본문의 오폭 주장을 **코드와 실 DB 로 직접 재확인**했습니다.

### 서버 — 앱 식별자가 3값뿐
```java
// services/dashboard-service/.../domain/AppClientType.java
public enum AppClientType { DESKTOP, WEB, MOBILE }
```
실 DB(`dashboard_db`) 제약도 동일:
```
ck_app_release_client_type  CHECK (client_type = ANY (ARRAY['DESKTOP','WEB','MOBILE']))
ux_app_release_client_type_version_active  UNIQUE (client_type, version) WHERE is_deleted = false
ix_app_release_client_type_active          (client_type) WHERE is_deleted = false
```

### 클라이언트 — 모바일 3앱이 전부 같은 값을 보냄
```
clients/mobile/src/version/versionCheck.ts:44          clientType: 'MOBILE',
clients/mobile-staff/src/version/versionCheck.ts:44    clientType: 'MOBILE',
clients/arologis-mobile/src/version/versionCheck.ts:44 clientType: 'MOBILE',
```

⟹ **관리자가 아로로지스 모바일(현 `1.0.0`) 용으로 `MOBILE 1.1.0` 을 `CRITICAL` 로 publish 하면, 삼한 모바일(`0.5.0`)·직원 모바일(`0.4.0`)도 같은 정책을 조회해 함께 차단됩니다.** 관리 화면에서 정상적인 릴리스 등록을 한 것뿐인데 무관한 두 앱의 사용자가 앱을 못 씁니다. **도달 가능**합니다.

### 현재 구현 범위 실측 (이슈 본문보다 좁습니다)
| 앱 | 버전 체크 | 보내는 식별자 |
|---|---|---|
| 삼한 데스크톱 | ✅ 있음 | `DESKTOP` |
| 삼한 모바일 · 직원 모바일 · 아로로지스 모바일 | ✅ 있음 | **셋 다 `MOBILE`** ← 오폭 |
| 주문 웹 · 종합견적 웹 · 모바일 퍼블릭 웹 | ❌ **없음** | — |
| 아로로지스 데스크톱 | ❌ **없음** | — |

즉 오폭이 **지금 실제로 일어나는 곳은 모바일 3앱**이고, 웹·아로로지스 데스크톱은 아직 이 축에 연결돼 있지도 않습니다.

### 등록 데이터 현황 (A3 마이그레이션 대상)
활성 릴리스는 전부 `DESKTOP` 입니다. `9.9.x` 대량 중복은 **전부 `is_deleted = true`** 인 과거 QA 잔재이며(부분 유니크 인덱스라 정상), 결함이 아닙니다.

---

## 2부 · 🚧 슬라이스 범위 (PM 결정)

이슈 전체는 PM 정찰 기준 **30~45파일 · 1.5~2.5K줄**입니다. 한 슬라이스로 묶으면 수렴이 길어지고, 무엇보다 **식별자가 없는 상태에서 알림을 만들면 알림도 오폭**합니다. 이슈 본문 스스로 *"본 슬라이스에서 가장 먼저 닫아야 하는 결함"* 이라고 지목한 축부터 닫습니다.

**이번 슬라이스에 포함**
- 서버 앱 식별자를 **8앱이 서로 구별되도록** 확장 (`AppClientType` + Flyway CHECK 제약 교체)
- 모바일 3앱이 **자기 앱을 모호하지 않게** 알리도록 전환
- 기존 등록 데이터가 **마이그레이션 후에도 같은 앱**(삼한 데스크톱)을 가리키도록 보존
- 릴리스 등록/조회 경로(관리 화면·API·mock)의 식별자 반영
- 회귀 울타리 + 실서버 QA

**이번 슬라이스 밖 (같은 이슈의 후속 슬라이스)**
- 웹 3앱·아로로지스 데스크톱의 **버전 체크 신설**
- **사용 중 알림**(N1) — 기동 시가 아니라 사용 중 감지
- **OTA 활성화**(모바일 `expo-updates`) 및 그에 반드시 동반돼야 하는 **N2 안전장치**

🚨 **이번 슬라이스는 OTA 를 켜지 않습니다.** 이슈가 경고한 *"N2 fix 는 OTA 활성화와 반드시 같은 슬라이스에서"* 조건을 어기지 않기 위해서입니다 — OTA 를 켜지 않으므로 `Updates.reloadAsync()` 경로가 무장되지 않습니다. **후속 슬라이스에서 OTA 를 켤 때 N2 를 반드시 같이 처리하십시오.**

🚫 발견 사항이 이 범위를 넘으면 **PR 코멘트로 목록만** 남기십시오. **새 이슈 등록 금지**(개발책임자 사전 허락 사항).

---

## 3부 · 불변식 (구현 수단은 지시하지 않습니다)

이슈 본문의 A1~A3 를 그대로 채택하고, 이번 슬라이스에 필요한 것을 더합니다.

| # | 불변식 |
|---|---|
| **A1** | 한 앱의 릴리스 등록·배포가 **다른 앱의 버전 판정에 영향을 주지 않는다** |
| **A2** | 앱은 자신이 어떤 앱인지 서버에 **모호하지 않게** 알린다 — 8개가 서로 구별된다 |
| **A3** | 기존 등록 데이터가 **마이그레이션 후에도 같은 앱을 가리킨다**(현 `DESKTOP` = 삼한 데스크톱). 마이그레이션 전에 등록된 릴리스가 소리 없이 다른 앱 것이 되지 않는다 |
| **A4** | 구버전 클라이언트(옛 식별자를 보내는 앱)가 **버전 확인을 못 해 차단되지 않는다** — 확인 실패는 작업을 막지 않는다(U3). 🔑 #920 에서 배포 순서 제약이 생긴 것과 같은 함정이므로, 이 슬라이스는 **BE 를 먼저 배포해도 안전**해야 한다 |
| **A5** | 관리자가 릴리스를 등록할 때 **어느 앱인지 화면에서 명확히 고르고**, 잘못 고르면 되돌릴 수 있다. 사용자에게 내부 식별자(enum 원문)를 그대로 노출하지 않는다 |

### 📌 PM 결정 — slug 에서 앱을 유추하지 말 것
이슈 정찰이 실측한 대로 `mobile-staff` 의 EAS slug 가 **`samhan-estimate`** 입니다(변경 금지 — projectId 연결). **slug 이름으로 앱을 유추하면 오배정합니다.** 명시 매핑이 필요합니다.

---

## 4부 · 회귀 울타리 — 표면을 명시합니다

| 표면 | 울타리가 잡아야 하는 것 |
|---|---|
| 오폭 차단 | A 앱 릴리스를 `CRITICAL` 로 등록해도 **B·C 앱의 판정이 바뀌지 않음**. 🔑 "A 가 차단된다"만 재면 A1 미검증 — **B·C 가 안 막힌다**를 함께 재야 한다 |
| 식별자 전송 | 모바일 3앱이 **각각 다른 값**을 보냄. 한 앱의 값을 바꿔도 다른 앱이 따라 바뀌지 않음 |
| 마이그레이션 보존 | 마이그레이션 전 `DESKTOP` 레코드가 후에도 **삼한 데스크톱** 정책으로 조회됨 (A3) |
| 마이그레이션 실증 | 🚨 Windows Testcontainers skip 이 마이그 결함을 가림 — **throwaway Postgres 에 전량 적용** `psql -v ON_ERROR_STOP=1`. 적용된 마이그는 **주석조차 수정 금지**, 신규 V 파일만. 번호는 **main 병합 시점 기준 확정**(이번 주 `V12` 선점 충돌 전례) |
| 구버전 안전 | 옛 식별자를 보내는 클라이언트가 **차단되지 않음**(A4) |
| 관리 화면 | 앱 선택이 화면에 드러나고, 사용자 표시가 내부 enum 원문이 아님 |
| mock 파리티 | 관리/조회 mock 이 실 BE 와 같은 계약 |

🚨 **RED-first**: 각 불변식을 깨는 실패 테스트를 먼저 쓰고 **RED 원문 제출 후** 고치십시오.
🚨 **CI allowlist** — 신규 테스트 클래스는 `.github/workflows/ci.yml` 의 해당 잡에 등재하십시오. 등재 누락은 거짓 green 입니다.

---

## 5부 · U-gate (효용 게이트)

머지 직전 **실데이터로 1회 실행**해 확인할 한 문장:

> 관리자가 **아로로지스 모바일용 릴리스를 `CRITICAL` 로 등록**했을 때, 아로로지스 모바일 사용자만 업데이트 안내를 받고 **삼한 모바일·직원 모바일 사용자는 아무 영향도 받지 않는다.**

라이브QA 는 게이트웨이 `:8080` · mock OFF · 실 로그인으로. ⚠️ **실 공유 `app_release` 에 write 하지 말고 throwaway 버전(`0.0.x-qa-…`)만 쓰고 정리**하십시오 — 공유 스택이라 다른 트랙 QA 가 같은 DB 를 씁니다.

---

## 6부 · 동반 의무

- 한국어 커밋/PR
- `docs/dev-reports/` 누적 · README·ROADMAP·DECISIONS·각 README 동기화 · `docs/samhan-public-overview.html` 동기화
- 라이브QA 스크린샷 **매 라운드** 실캡처 — 사용자 채팅 인라인 + PR SHA-pinned 양쪽
- 사용자에게 UUID·내부 enum 원문 노출 금지
