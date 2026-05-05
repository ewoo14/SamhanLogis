# Phase 1 — Apps Script 분석: long-pending (장기미발주 거래처 선별)

> 원본: `migration/source/scripts/long-pending/Code.js` (231 lines)
> appsscript.json: timezone Asia/Seoul, runtimeVersion V8, dependencies 없음, **HTML UI 없음** (백엔드 배치 전용)
> 분석 일자: 2026-05-04 / 분석 원칙: 무손실 / 추측 금지 / 토큰 placeholder 유지

---

## §1. 함수 inventory (누락 0)

전체 5개 함수 (top-level 1 + private helpers 4). 라인 매핑:

| # | 함수명 | 라인 | private (`_` suffix) | 역할 요약 |
|---|---|---|---|---|
| 1 | `processLongTermUnusedClientsFast` | 12–62 | No (entry point) | 메인 배치 — 활동집계 + 대상조회 + 상태전환 (승인↔장기미발주) |
| 2 | `getActiveBizNosFromLog_` | 65–107 | Yes | NOTION_DB_ID_LOG (작업 로그 DB) 조회 — 30일 내 "주문 성공" 로그의 거래처코드 수집 |
| 3 | `getActiveBizNosFromShipping_` | 110–158 | Yes | NOTION_DB_ID_SHIPPING (배송 DB) 조회 — 30일 내 created_time 또는 출고일 기준 거래처코드 수집 |
| 4 | `getTargetClients_` | 161–211 | Yes | NOTION_DB_ID_AUTH (인증 DB) 조회 — 승인상태 ∈ {승인, 장기미발주} 거래처 전체 페이지네이션 |
| 5 | `updateClientStatus_` | 214–231 | Yes | Notion 페이지 PATCH — `승인상태` select 컬럼 단일 갱신 |

상수 (라인 2–9): `NOTION_TOKEN_LOG`/`NOTION_DB_ID_LOG`, `NOTION_TOKEN_AUTH`/`NOTION_DB_ID_AUTH`, `NOTION_TOKEN_SHIPPING`/`NOTION_DB_ID_SHIPPING` — 토큰 3종 + DB ID 3종.

**누락 0 확인**: 231라인 / 함수 5개 / 상수 6개 모두 inventory 등재.

---

## §2. 시트 read/write 매트릭스

| 시트 | Read | Write |
|---|---|---|
| (없음) | — | — |

**SpreadsheetApp / Sheet API 호출 0건**. long-pending 스크립트는 Google Sheet 를 전혀 사용하지 않음. 모든 데이터 source 와 sink 는 Notion DB. workbook.json 참조 불요.

---

## §3. 외부 의존

### Notion API (3개 DB / 3개 토큰)

| 토큰 placeholder | DB ID | endpoint 호출 | HTTP method | 함수 |
|---|---|---|---|---|
| `REDACTED_NOTION_TOKEN_LOG_007` | `2eda1006d65880d696b3da4a8d281ea2` | `POST /v1/databases/{id}/query` | POST | `getActiveBizNosFromLog_` |
| `REDACTED_NOTION_TOKEN_SHIPPING_004` | `2f8a1006d658803face6fdfe2b175780` | `POST /v1/databases/{id}/query` | POST | `getActiveBizNosFromShipping_` |
| `REDACTED_NOTION_TOKEN_AUTH_008` | `2dda1006d6588047b1bbc7c2660203c0` | `POST /v1/databases/{id}/query` + `PATCH /v1/pages/{id}` | POST + PATCH | `getTargetClients_`, `updateClientStatus_` |

- Notion-Version 헤더: `2022-06-28` (3곳 동일)
- 페이지네이션: `page_size: 100` + `start_cursor` / `has_more` 루프 (3 query 함수 모두)
- `muteHttpExceptions: true` 후 `getResponseCode() !== 200` 체크 → 실패 시 break (재시도 없음)

### Google Apps Script services

| Service | 용도 |
|---|---|
| `UrlFetchApp.fetch` | Notion HTTP 호출 (POST query × 3, PATCH page × 1) |
| `Logger.log` | 진행/실패 로그 출력 (한국어 + emoji 라벨) |

**사용하지 않는 서비스**: SpreadsheetApp, GmailApp, DriveApp, MailApp, ScriptApp, PropertiesService, CacheService, LockService — 0건.

---

## §4. 트리거

- `appsscript.json` 의 `triggers` 정의 **없음** (UI 또는 ScriptApp 동적 등록 추정).
- 코드 내 `ScriptApp.newTrigger(...)` **없음** → 트리거는 Apps Script Console 에서 **수동 등록된 Time-driven trigger** 로 추정.
- `processLongTermUnusedClientsFast` 내부 로직이 `dayOfWeek === 1` (월요일) 분기를 가짐 → 일일 트리거 (daily) 등록 후 코드에서 요일별 분기 처리.
- 함수명에 `Fast` suffix → 이전 버전 (slow) 이 존재했을 가능성 (legacy).

**확정 사실**: Manual / Time-driven 여부는 Apps Script 콘솔의 트리거 탭에서만 확인 가능 (코드만으로는 단정 불가). 코드 분기 패턴상 **daily 00:00 KST trigger** 가 가장 합리적 추정.

**추측 금지 가드**: §9 누락 항목으로 등재.

---

## §5. 변동DC 감지 룰

**해당 없음** — long-pending 스크립트는 product / 견적 / 단가와 무관. `hasVariableDiscount` 컬럼 사전 계산 대상 외.

---

## §6. 세트(Bundle) 품목 처리

**해당 없음** — long-pending 스크립트는 product 도메인 미터치. 거래처(partner) 상태만 다룸.

---

## §7. 핵심 비즈니스 흐름 — 장기미발주 판정 로직

### 7.1 입력
- 현재 시각 `now` → `dayOfWeek` (0=일 ... 1=월 ... 6=토)
- `isMonday = (dayOfWeek === 1)`
- `thresholdDate = now - 30일` (밀리초 계산: `30 * 24 * 60 * 60 * 1000`)
- `thresholdIso = thresholdDate.toISOString()`

### 7.2 활동 집계 (`activeBizNos: Set<number>`)
1. **로그 DB** (`getActiveBizNosFromLog_`): created_time ≥ threshold AND `로그` rich_text contains `'주문 성공'` → page.properties.`거래처코드`.number 수집
2. **출고 DB** (`getActiveBizNosFromShipping_`): created_time ≥ threshold OR `출고일` date ≥ threshold → page.properties.`거래처코드`.number 수집
3. 두 source 합집합 → `activeBizNos`

### 7.3 대상 거래처 조회 (`getTargetClients_`)
- 인증 DB 에서 `승인상태` select ∈ {`승인`, `장기미발주`} 페이지 전체
- 각 페이지에서 `{pageId, bizNo (title plain_text), status, createdTime (page.created_time)}` 추출
- bizNo 정규화: `Number(String(client.bizNo).replace(/[^\d]/g, ''))` — 숫자만 추출

### 7.4 상태 전환 룰 (핵심 판정)

| 현재 상태 | 조건 | 트리거 | 신 상태 | 호출 |
|---|---|---|---|---|
| `승인` | `isMonday && !isActive && client.createdTime < thresholdDate` | 월요일에만 평가 | `장기미발주` | `updateClientStatus_(pageId, '장기미발주')` |
| `장기미발주` | `isActive` (활동 재개) | 매일 평가 | `승인` | `updateClientStatus_(pageId, '승인')` |
| 기타 | 평가 대상 외 | — | unchanged | — |

**임계값 명세**:
- 미발주 기간: **30일** (= 30 × 24 × 60 × 60 × 1000 ms)
- 기준 활동: `로그DB의 '주문 성공' 텍스트 매칭` ∪ `출고DB의 created_time / 출고일`
- 최초 가입 가드: `client.createdTime < thresholdDate` — 가입 30일 미만 신규 거래처는 장기미발주 전환 제외 (**오탐 방지**)
- 강등 평가 주기: **주 1회 (월요일)**
- 복구 평가 주기: **매일** (활동 재개 즉시 복구하기 위해 비대칭)

### 7.5 출력 (Side Effect)

| 출력 | 위치 | 형식 |
|---|---|---|
| 상태 변경 | NOTION_DB_ID_AUTH 페이지 `승인상태` select | `'승인'` ↔ `'장기미발주'` |
| 진행 로그 | Stackdriver (`exceptionLogging: STACKDRIVER`) | `Logger.log` (한국어 emoji) |

**별도 출력 없음**: Notion DB 인쇄 / 시트 기록 / 이메일 발송 모두 **없음**. 결과는 Auth DB 페이지의 `승인상태` 컬럼 in-place 갱신만으로 소비됨. 다운스트림 시스템 (예: 발주 화면) 이 `승인상태 = 장기미발주` 인 거래처를 어떻게 처리하는지는 본 스크립트 외부 (partner-order 등) 의 책임.

### 7.6 추출 결과 사용
- 본 스크립트는 **분류기 (classifier)** 만 — 추출된 "장기미발주" 라벨은 다른 시스템 (estimate / partner-order) 에서 발주 차단 / 경고 표시 등에 사용될 것으로 추정 (cross-script 분석 시 검증).

---

## §8. Java 포팅 권장 구조

### 8.1 결정 요지: **partner-service 확장** (PartnerAnalyticsService 신규 분리 X)

| 비교축 | partner-service 확장 (권장) | PartnerAnalyticsService 신규 |
|---|---|---|
| 도메인 정합성 | Partner.approvalStatus enum 직접 변경 → Bounded Context 자연 정합 | 신규 컨텍스트 추가 — 경계 모호 |
| 데이터 의존 | partner-service 내 Partner 만 read/write | partner + slip + delivery 3-service join 필요 → 복잡 |
| 트랜잭션 | local TX 가능 | cross-service 호출 + saga 검토 부담 |
| 운영 | 단일 cron job + 단일 owner | 신규 service deploy 필요 |
| 향후 확장 | 다른 partner 분석 (등급, 신용도) 수요 시 service 분리 시점 재검토 | over-engineering |

### 8.2 partner-service 확장 명세

**도메인**:
```java
// Partner.java (기존 entity 확장)
public enum ApprovalStatus { PENDING, APPROVED, LONG_PENDING_NO_ORDER, REJECTED, ... }
// 한국어 라벨: '승인'='APPROVED', '장기미발주'='LONG_PENDING_NO_ORDER'
```

**Service**:
```java
// PartnerLongPendingService.java (신규)
@Service
public class PartnerLongPendingService {
    private static final Duration THRESHOLD = Duration.ofDays(30);

    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Seoul") // 매일 00:00 KST
    public void evaluateLongPending() { ... }

    Set<Long> collectActiveBizNos(Instant since) { ... } // slip-service + delivery-service 호출
    void demoteToLongPending(Partner p) { ... }          // approvalStatus 변경 + audit
    void restoreToApproved(Partner p) { ... }
}
```

**다운스트림 데이터 source 매핑**:
| Notion DB | SamhanLogis service | 조회 방법 |
|---|---|---|
| 로그 DB (주문성공 로그) | slip-service `Slip` (status=COMPLETED, createdAt ≥ since) | Feign client `SlipClient.findActivePartnersSince(since)` |
| 출고 DB | delivery-service `DeliveryOrder` (createdAt OR shippedAt ≥ since) | Feign client `DeliveryClient.findActivePartnersSince(since)` |
| 인증 DB (거래처) | partner-service `Partner` (approvalStatus IN {APPROVED, LONG_PENDING_NO_ORDER}) | local repository |

**스케줄링**: Spring `@Scheduled(cron=..., zone="Asia/Seoul")` — 매일 실행, 함수 내부에서 요일 분기 (`LocalDate.now(KST).getDayOfWeek() == MONDAY`).

**테스트**: SlipClient / DeliveryClient `@MockBean` 격리 (회고: `feedback_it_mockbean_external_clients.md`).

**감사 로그**: BaseEntity 7 audit fields + 별도 `PartnerStatusChangeLog` entity 권장 (legacy 의 Logger.log 대체).

---

## §9. 누락/모호

| # | 항목 | 근거 | 후속 조치 |
|---|---|---|---|
| 1 | 트리거 등록 형태 (Manual / Time-driven daily / weekly) | `appsscript.json` 에 trigger 정의 없음 + `ScriptApp.newTrigger` 호출 없음 | Apps Script Console UI 의 트리거 탭 스크린샷 요청 |
| 2 | "장기미발주" 라벨이 다운스트림 (estimate / partner-order) 에서 어떻게 소비되는지 | 본 스크립트 외부 책임 | Phase 1 다른 스크립트 (partner-order 등) 분석 시 cross-reference |
| 3 | 30일 임계값의 비즈니스 근거 (왜 30일인가? 60일/90일 정책 가능성?) | 코드 magic number | 사용자(개발책임자)에게 정책 확인 — Phase 4 Migration Plan 시 application.yml 외부화 권장 |
| 4 | Notion `로그` rich_text 의 `'주문 성공'` 외 다른 성공 메시지 패턴 존재 여부 | 단일 substring 매칭 | 로그 DB 데이터 샘플로 검증 (Phase 4) |
| 5 | `거래처코드` 컬럼 타입 — 로그/출고 DB 는 `number`, 인증 DB 는 `title.plain_text` 로 비대칭 | 라인 100, 151, 197 | partner-service 의 사업자번호 정규화 룰과 일치 확인 |
| 6 | `updateClientStatus_` 의 PATCH 응답 코드 미체크 | 라인 222–231 | Java 포팅 시 응답 검증 + 실패 시 재시도/알림 추가 |
| 7 | Notion DB 의 페이지 수 (성능 추정) | 미상 | Phase 4 시 page count 측정 → batch 성능 예측 |

---

## §10. 회고 가드

| 회고 가드 (메모리) | 본 분석 적용 여부 |
|---|---|
| `feedback_function_documentation.md` (3-layer 한국어 Javadoc + springdoc + dev-reports 누적) | Phase 6 구현 의무 — `PartnerLongPendingService` 의 모든 메서드에 한국어 Javadoc + 룰 출처 (Apps Script `processLongTermUnusedClientsFast`) 명시 |
| `feedback_uuid_no_user_visibility.md` | 본 도메인은 사업자번호 (비즈니스 식별자) 만 사용 — UUID 노출 위험 0 |
| `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) | "장기미발주", "승인복구" 의미를 enum + Javadoc 으로 명세 |
| `feedback_it_mockbean_external_clients.md` | SlipClient / DeliveryClient `@MockBean` 격리 명시 (§8.2) |
| `feedback_korean_commits.md` | 본 산출물 한국어 작성 — 통과 |
| `feedback_role_naming_full.md` | 풀네임 사용 — 통과 |
| `feedback_powershell_utf8_writes.md` | 본 파일 Write 도구로 UTF-8 직접 작성 — 통과 |
| `DOMAIN-EXTENSIONS.md` §1 (변동DC) / §2 (세트) | long-pending 은 무관 — §5 / §6 명시적 "해당 없음" |

---

## 부록 A — long-pending 특화 추가 의무 답변

| 의무 항목 | 답변 |
|---|---|
| 장기미발주 판정 임계값 | **30일** (밀리초 상수 `30 * 24 * 60 * 60 * 1000`, 라인 19) |
| 판정 기준 | "주문 성공" 로그 (NOTION_DB_LOG) ∪ 출고 활동 (NOTION_DB_SHIPPING) 의 created_time / 출고일 ≥ now-30d |
| 출력 위치 | NOTION_DB_AUTH 페이지의 `승인상태` select 컬럼 in-place PATCH (별도 인쇄/탭/이메일 없음) |
| 트리거 자동화 | `appsscript.json`/코드에 명시적 trigger 정의 없음 → Apps Script 콘솔 수동 등록 추정. 코드 내부 `isMonday` 분기로 보아 **daily Time-driven trigger** 가 가장 합리적 추정 (단정 불가 — §9 #1 후속 조사) |

---

_생성: Phase 1 분석 / 무손실 / 추측 금지 / 토큰 placeholder 보존_
