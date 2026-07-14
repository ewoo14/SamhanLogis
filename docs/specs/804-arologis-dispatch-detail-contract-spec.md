# SP-10-2 / #804 — arologis 배차 상세 FE-BE 계약 정합 스펙

**이슈**: #804 (BUG) arologis-desktop 배차 상세 FE-BE DTO 계약 전면 불일치
**슬라이스**: SP-10-2 인성데이타 퀵프로그램 vendor 통합 (계약 정합 후속)
**작성일**: 2026-07-14
**정본 방향**: **Approach A — 계약정합 + 미구현(GPS/알림) 이연** (개발책임자 승인 2026-07-14)
**연관**: #785(크래시 fix·PR #803)·SP-10-2 design `docs/design/sp-10-2-insung-quick-vendor/`

---

## 1. 문제 (현행)

arologis-desktop `DispatchDetailPage`(SP-10-2 FE-1~4 완성)는 rich 뷰모델(`DispatchDetail`/`VehicleDetail`)을 소비하는데, 라우트 래퍼(`routes/index.tsx:75-88`)가 실 BE 응답 `DispatchDetailResponse`(얇은 초기 DTO)를 **무매핑으로 그대로 캐스팅**한다. 필드명이 대부분 불일치하여 런타임에 대부분 `undefined` → **배차 상세가 placeholder/공백으로만 렌더**(#803 fix로 크래시는 없으나 무의미). 실서버 `GET /admin/arologis/dispatches/{id}` 연동 시 `matchStatus`가 항상 undefined라 `VehicleMatchStatusBadge`가 "대기 중" 고정.

## 2. BE 데이터 가용성 (정찰 확정 — 정본 방향 근거)

| FE 기대 필드 | BE 실재 | 판정 |
|---|---|---|
| `matchStatus` | Vehicle.`status` (`VehicleStatus`) | ✅ **6값 FE와 정확히 1:1**(PENDING/MATCHING/ASSIGNED/DEPARTED/DELIVERED/CANCELLED). 이름만 상이 |
| `tonnageLabel` | Vehicle.`tonnage` (`VehicleTonnage` 9값·Javadoc 한글) | ✅ enum→라벨 |
| `dispatchTypeLabel` | `dispatchType` (`DispatchType` DAY/NIGHT/EXPRESS) | ✅ enum→라벨 |
| `routeLabel`·`stopCount` | `stops[]` (parsedPartnerName/parsedAddress) | ✅ 파생 |
| `driverCode` | `assignedDriverCode` (이미 DTO 노출·UUID 가드) | ✅ 리네임 |
| `vendorOrderId` | Vehicle.`vendorOrderId` (VARCHAR64·V13·인성 주문번호) | ⚠️ **도메인 실재·DTO 미노출**. `externalRefId`(VARCHAR100 범용)와 **별개 2컬럼** — 현 DTO는 externalRefId만 노출(FE 소비 0건). 인성 주문번호 노출하려면 DTO에 vendorOrderId 추가 |
| `sandboxMode` | `ArologisMatcherProperties.insungQuick.sandboxMode` (default true) | ⚠️ **config-only·DTO 미주입** → DTO 주입 필요(소규모) |
| **`notifyResults[]`** | **arologis 완전 부재** | ❌ notification-service에 유사 스키마(NotificationLog) 있으나 별도 서비스·DB·조인키 없음·arologis→notification skeleton no-op·enum 명칭 불일치 → **신규 기능** |
| **`gpsSources[]`** | driver_locations write-only(조회 repo 메서드 0)·Insung LBS 미구현 | ❌ read 경로·DTO 없음 → **신규 기능** |

**결론**: FE-1(매칭배지)·FE-4(주문번호 툴팁)는 실 데이터로 **지금 배선 가능**. FE-2(GPS)·FE-3(알림)은 **백엔드 데이터 자체가 미구현** → 본 PR 범위 밖(별도 슬라이스 이연).

## 3. 범위 (Approach A)

### 3.1 BE 변경 (arologis-service) — 최소 additive
1. **`DispatchDetailResponse`** top-level에 `boolean sandboxMode` 추가.
2. **`DispatchDetailResponse.VehicleDetail`**에 `String vendorOrderId` 추가(Vehicle.getVendorOrderId()). `externalRefId`는 **유지**(backward-compat·FE 미소비이나 제거는 별건 판단). `vendorStatus`는 현 FE 미사용 → 미추가.
3. **`DispatchDetailResponse.from(...)`** 시그니처에 `sandboxMode` 파라미터 추가, `VehicleDetail.from`에 vendorOrderId 매핑.
4. **`ArologisAdminController.findById`**가 `ArologisMatcherProperties`를 주입받아 `matcherProperties.getInsungQuick().isSandboxMode()`를 `from(...)`에 전달.
5. `@Schema`/Javadoc 갱신.

> **불변**: 재검증·마감금액류 없음(순수 조회 DTO). status/tonnage/matchSource enum 직렬화 문자열 무변경. 순수 additive라 기존 소비자 회귀 없음.

### 3.2 FE 변경 (arologis-desktop) — BE 미러링 + 얇은 어댑터
프로젝트 패턴(기존 arologis API client = BE record 1:1 + 컴포넌트 변환) 준수.

1. **신규 `api/arologisDispatchDetail.ts`**:
   - **raw wire 타입** `RawDispatchDetailResponse`/`RawVehicleDetail`/`RawStopDetail` = BE `DispatchDetailResponse`와 1:1(dispatchId, dispatchDate, dispatchType, sandboxMode, vehicles[{sequence, tonnage, label, assignedDriverCode, matchSource, externalRefId, vendorOrderId, status, stops[]}]).
   - **어댑터 `mapDispatchDetail(raw): DispatchDetail`** — §4 매핑표대로 변환.
   - **`getDispatchDetail(dispatchCode): Promise<DispatchDetail>`** — fetch + envelope unwrap + map.
2. **`DispatchDetailPage.tsx`** 뷰모델 타입 정리:
   - `VehicleDetail`에서 **미사용 `id` 제거**(BE가 vehicleId UUID 비공개 — FE도 보유 주장 안 함·UUID 비공개 규율 정합. row key는 sequence 유지).
   - `notifyResults?`/`gpsSources?`는 optional 유지(BE 미전송 → undefined).
3. **`routes/index.tsx` 래퍼**: 인라인 fetch+캐스팅 → `getDispatchDetail(dispatchCode)` 사용(어댑터 경유). loadError/loading 분기 유지.
4. **미구현 섹션 정직 비표시**(개발책임자 "비표시" 의도): `VehicleRow`에서 GPS 패널은 `gpsSources?.length`가 있을 때만 렌더(현재 BE 미전송 → 빈 shell 미노출). 알림 섹션은 이미 empty 시 `null` 반환(비표시). → 데이터 생기면(FE-2/FE-3 구현) 자동 표시.
5. **enum→라벨 맵**(FE): `TONNAGE_LABEL`(VehicleTonnage 9값·Javadoc 한글 미러), `DISPATCH_TYPE_LABEL`(DAY→주간·NIGHT→야간·EXPRESS→특송). matchStatus는 `VehicleMatchStatusBadge.STATUS_LABEL` 재사용(뱃지 내부).

## 4. 필드 매핑표 (raw BE → FE 뷰모델)

| 뷰모델 필드 | raw BE 소스 | 변환 규칙 |
|---|---|---|
| `DispatchDetail.id` | `dispatchId` | passthrough(라우팅 참조·미렌더) |
| `.dispatchDate` | `dispatchDate` | passthrough |
| `.dispatchTypeLabel` | `dispatchType` | `DISPATCH_TYPE_LABEL[e]` (미지값 fallback 원문 대신 "기타") |
| `.sandboxMode` | `sandboxMode` | passthrough(bool) |
| `.vehicles[]` | `vehicles[]` | 아래 |
| vehicle `.sequence` | `sequence` | passthrough |
| `.tonnageLabel` | `tonnage` | `TONNAGE_LABEL[e]` (미지 fallback "기타") |
| `.routeLabel` | `stops[]` | `${first} → ${last}`; first/last = 첫·끝 stop `parsedPartnerName`(fallback `parsedAddress`, fallback ""). stops≤1이면 단일 라벨 or "". (region 토큰화는 RegionClassifier 필요 → 비필수·이연) |
| `.stopCount` | `stops.length` | 정수 |
| `.matchStatus` | `status` | 리네임(값 동일 6값). 미지값 시 뱃지가 "상태 확인 필요" degrade(#785 기존) |
| `.driverCode` | `assignedDriverCode` | passthrough(nullable) |
| `.vendorOrderId` | `vendorOrderId` | passthrough(nullable) |
| `.notifyResults` | (없음) | `undefined` (FE-3 이연) |
| `.gpsSources` | (없음) | `undefined` (FE-2 이연) |

## 5. 이연 (별도 슬라이스 — 신규 이슈)

본 PR은 계약 정합만. 아래는 백엔드 데이터 자체가 미구현이라 별건(신규 이슈 발행):
- **FE-3 알림 발송이력 백엔드**: 배차 알림 발송 시 dispatchId/vehicleId 상관저장 + notification-service 조회 client/endpoint + 채널(insung-talk/aligo)·상태(SUCCESS/FAILED/DELAYED) enum 매핑 계약 + DTO `notifyResults` 노출.
- **FE-2 GPS 멀티소스 백엔드**: `driver_locations` 조회 repo 메서드 + vehicle(assignedDriverId↔driverId) 조인 + `DispatchDetailResponse` `gpsSources` 노출 + (Insung LBS는) EXTERNAL_INSUNG_LBS 위치피드 수집기(현재 Signature로만 유입·미cutover).

## 6. 테스트

- **BE**: `DispatchDetailResponse`/`from` 매핑 단위테스트(vendorOrderId·sandboxMode 채움 단언), `ArologisAdminController` IT(@SpringBootTest/MockMvc·Testcontainers)로 `GET /dispatches/{id}` 응답에 sandboxMode·vendorOrderId 직렬화 실측. 기존 IT 회귀 0.
- **FE**: `mapDispatchDetail` 어댑터 단위테스트(각 필드 변환·null·enum 미지값 fallback·routeLabel 파생·stopCount·notify/gps undefined), `DispatchDetailPage.test.tsx` 갱신(id 제거·실 뷰모델), 라우트 래퍼 fetch→map 경로. typecheck exit 0. mock.ts 정합.

## 7. 라이브 QA

Docker 실서버(mock OFF·:8080·arologis-desktop standalone 하네스 [[feedback_arologis_desktop_standalone_qa_harness]]). arologis-service jar 재배포 후 실 배차(dev 시드) 상세 진입 → **실 GUI 단계별 스샷**: 매칭배지 실 status 표시(placeholder "대기 중" 고정 해소)·톤수/경로/정차수 실값·주문번호 hover 툴팁·sandbox 배너(sandboxMode=true). GPS/알림 섹션 비표시 확증. dev 데이터 부족 시 투명 QA 시드+즉시 원복([[feedback_no_fake_data_ever]]).

## 8. 범위 밖 (불변)
- notifyResults/gpsSources **데이터 생성/노출**(§5 이연).
- Insung LBS 실연동 cutover(sandbox HMAC 우회 단계).
- externalRefId DTO 제거(별건 판단·본 PR은 additive 유지).
- SP-10-2 라우팅/사이드바 링크(기존 vite rewrite·무변경).
