# #999 재고 인스턴스 시리얼키·QR 정찰

## 개발책임자 결정 필요

> **브리핑과 이슈 댓글의 결정 상태가 다르다.** 현재 브리핑은 아래 가·나를 결정 대상으로 지정하지만, 이슈 #999의 2026-08-06 개발책임자 댓글은 가를 이미 확정하고 대신 `기존행 시리얼키 소급 발급 규칙`과 `품질 정상 기본값 vs 입력 강제`를 미결정으로 기록한다. 첫 PR을 발주하려면 어느 기록이 최신인지 정합성을 먼저 맞춰야 하며, 아래에서는 요청된 가·나의 선택지와 근거를 그대로 정리한다.

### 가. 시리얼키 노출 형식

**기존 결정 정합성 확인이 먼저다.** 이슈 #999의 2026-08-06 개발책임자 댓글에는 이미 “창고 방식 그대로, 접두사만 다르게”가 확정돼 있다. 근거 코드는 `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/WarehouseService.java:89-96,126-139`의 `WH-` + 혼동 문자 `0/1/O/I/L`을 뺀 6자 무작위 코드와 중복 재시도 방식이다. 따라서 아래 두 선택지는 새 결정을 내리기 전에 **기존 결정을 유지할지 번복할지**로 다뤄야 한다.

| 선택지 | 근거 |
|---|---|
| `yyyy/MM/dd-N` 일별 일련번호로 변경한다 | 같은 inventory-service의 실사번호·재고이동번호와 전표번호가 이 형식이다. 다만 제품에 계속 붙는 시리얼키와 업무문서 번호는 수명·용도가 다르고, 이 선택은 2026-08-06 결정을 번복한다. |
| 2026-08-06 결정을 유지해 창고 코드와 같은 방식의 별도 형식을 쓴다 | 라벨을 육안으로 읽고 옮길 때 혼동되는 문자를 제외하며, 시리얼키의 장기 부착·단건 식별 성격에 맞는다. 실제 접두사는 “창고와 다르게”까지만 확정돼 있다. |

체크섬을 붙이는 노출 코드 선례는 없다. 따라서 별도 형식을 택하더라도 체크섬 도입 여부는 기존 관례로 확정할 수 없다.

### 나. QR 스캔 접점

| 선택지 | 근거와 비용·유지보수 영향 |
|---|---|
| `clients/mobile-staff`에 스캐너 의존성과 화면·라우트를 새로 도입한다 | 창고 현장에서 휴대폰으로 바로 처리할 수 있다. 현재 scanner 의존성·스캔 화면·라우트가 전혀 없으므로 카메라 권한, 기기별 동작, 라이브러리 업데이트와 배포를 새로 유지해야 한다. |
| 데스크톱 USB 스캐너를 우선 접점으로 쓴다 | 일반적인 키보드 입력형 스캐너라면 전용 모바일 카메라 의존성을 피할 수 있다. 대신 창고 PC와 스캐너 구매·배치가 필요하고, 입력 포커스·중복 스캔·오입력 방지 UI를 데스크톱에서 유지해야 한다. |

두 선택지 모두 백엔드에 아직 없는 **노출 시리얼키 단건 조회 및 입출고·품질 기록 계약**이 전제다.

## 이미 측정된 사실 — 재측정하지 않음

아래는 `docs/dev-reports/2026-08-10-1128-s1-recon.md`의 측정 결과를 그대로 인용한다.

```text
stock_instances  이미 존재 · 활성 20행 / product UUID 9 / 상태 AVAILABLE 6 · SHIPPED 14
노출 코드 선례   실사번호·재고이동번호·전표번호 = yyyy/MM/dd-N 일별 일련번호
                 체크섬 붙이는 선례는 없음
모바일          clients/mobile-staff 에 QR/바코드 스캔 화면·라우트·scanner 의존성 없음
                 expo-image-picker(사진 촬영)만 있음
inventory       재고 실사 라인의 scanned 기록 계약은 있으나
                 QR 값을 읽어 입출고하는 진입점은 없음
```

## ① “재고상황/품질 2축 분리”의 코드 좌표

### 결론

현재 DB에 두 종류의 값이 한 컬럼의 enum 값으로 함께 저장된 것은 아니다. **재고상황 축만 `stock_instances.status`에 있고 품질 축은 아예 없다.** 그러나 회수품 처리 코드가 “어디에 있는가”와 “검수 뒤 어떤 품질인가”를 별도 기록하지 않고 하나의 `status` 전이에 흡수한다. 이 때문에 현재 모델은 두 의미를 독립적으로 표현·보존할 수 없다.

| 층 | 파일·필드 좌표 | 현재 의미와 혼재 지점 |
|---|---|---|
| DB | `services/inventory-service/src/main/resources/db/migration/V15__create_stock_instances.sql:8,30`의 `stock_instances.status` | `AVAILABLE / RESERVED / SHIPPED / RECALLED`만 저장한다. 별도 품질 컬럼은 없다. |
| 엔티티 | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstance.java:69-71`의 `StockInstance.status` | `StockInstanceStatus` 단일 필드가 인스턴스의 유일한 상태 표현이다. |
| enum | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstanceStatus.java:18-26` | `AVAILABLE`, `RESERVED`, `SHIPPED`, `RECALLED`는 모두 재고상황 값이다. `정상·중고·파손·재포장·박스불량`에 대응하는 값이나 별도 enum은 없다. |
| 도메인 전이 | `StockInstance.java:188-191`의 `recall()`과 `:208-224`의 `resell()` | 회수 시 `SHIPPED → RECALLED`, “검수 완료 후 재판매 가능”이면 곧바로 `RECALLED → AVAILABLE`로 바꾼다. 검수 결과가 정상인지, 중고인지, 재포장인지 등은 저장하지 않는다. 즉 재고상황 전이가 품질 판정의 통과 여부까지 암묵적으로 겸한다. |
| API | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockInstanceResponse.java:15-45` | 응답에 `status`는 있으나 품질 필드가 없다. 따라서 두 축을 함께 조회할 계약이 없다. |
| 동작 접점 | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockInstanceController.java:232-254` | `resell-batch`는 “검수 완료 회수품 재판매”를 수행하지만 품질 입력을 받지 않는다. 입출고 시 품질을 분류·보존할 접점이 아니다. |

따라서 분리할 두 축의 코드상 정의는 다음과 같다.

- **재고상황 축:** 기존 `StockInstance.status` / DB `stock_instances.status` — `AVAILABLE`, `RESERVED`, `SHIPPED`, `RECALLED`의 물류 생명주기.
- **품질 축:** 현재 부재 — 이슈 #999가 요구한 `정상`, `중고`, `파손`, `재포장`, `박스불량`을 재고상황과 독립적으로 저장·조회·입출고 시 기록할 축.

핵심은 기존 `status` 값을 품질 값과 섞어 확장하는 것이 아니라, 기존 재고상황 필드는 유지하고 품질을 별도 축으로 두는 것이다. 그래야 예를 들어 `AVAILABLE + 박스불량`, `RECALLED + 파손`처럼 실제 조합을 표현할 수 있다.

## ② `stock_instances`에 부족한 것

이미 있는 필드는 반복하지 않고, 현재 코드와 이슈 #999의 차이만 적는다.

1. **UUID와 분리된 노출용 시리얼키가 없다.** DB 컬럼, 엔티티 필드, 응답 필드 모두 없다. 현재 migration은 오히려 `id UUID`를 시리얼 키라고 주석 처리한다(`V15__create_stock_instances.sql:1,29`; `StockInstance.java:22-24`).
2. **노출용 시리얼키의 유일성 보장이 없다.** 컬럼이 없으므로 unique constraint/index도 없고, 동시 발급 시 중복을 막는 채번 계약도 없다.
3. **기존 활성 20행에 노출용 시리얼키를 발급하는 이관 계약이 없다.** 어느 순서와 기준으로 기존행을 채울지 정해지지 않았다. 이 수치는 위 정찰 보고서 인용값이며 재측정하지 않았다.
4. **품질 축이 없다.** `정상·중고·파손·재포장·박스불량`을 저장할 DB 컬럼, 도메인 enum/필드, 응답 필드가 없다.
5. **입출고 시 품질을 필수 기록하는 요청 계약이 없다.** 현재 create/batch/ship/recall/resell 요청은 품질을 받지 않으며, 품질 미기록을 막는 DB `NOT NULL` 또는 서비스 검증도 없다.
6. **노출 시리얼키로 단일 인스턴스를 찾고 전이시키는 계약이 없다.** 현재 조회·전이는 product UUID, productCode, 전표번호, 거래처, 수량의 배치 단위다. QR이 담을 시리얼키를 해석해 해당 인스턴스를 특정하는 repository/service/API 진입점이 없다.

QR 자체를 저장하는 별도 컬럼은 부족 항목으로 세지 않는다. 이슈 계약상 QR payload는 노출 시리얼키이므로, 결정된 시리얼키로 QR을 생성·인쇄하고 스캔 결과로 조회하면 된다.

## ③ 첫 슬라이스

첫 PR은 **inventory-service의 시리얼·품질 백엔드 기반만** 발주한다: 기존 UUID PK와 재고상황 `status`는 그대로 두고, 가 항목에서 재확인된 형식의 노출용 시리얼키 컬럼·중복 방지 채번, 이슈 댓글의 미결정 사항을 확정한 규칙대로 수행하는 기존행 소급 발급과 품질 기본값/입력 검증 migration, 별도 품질 enum/필드, `StockInstanceResponse`의 시리얼키·품질 반환, 시리얼키 단건 조회 API까지 한 번에 넣는다. 이 PR에서는 QR 이미지 저장 컬럼, 모바일/데스크톱 스캔 화면, 장비 연동을 넣지 않으며, 나 항목에서 접점이 결정된 뒤 다음 슬라이스가 이 단건 조회 계약을 소비한다.
