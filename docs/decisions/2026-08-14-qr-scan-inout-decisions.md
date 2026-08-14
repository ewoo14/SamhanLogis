# `#999` 축 ③ QR 스캔 입출고 — 개발책임자 결정 (2026-08-14)

> 근거 정찰: [`docs/dev-reports/2026-08-14-999-qr-recon.md`](../dev-reports/2026-08-14-999-qr-recon.md)
> 관련: `#1199`(축 ① 시리얼키 · 머지됨) · `#1203`(축 ② 재고이동 확정 · 오늘 머지)

---

## 결정 요약

| 축 | 결정 |
|---|---|
| **A — QR 내용** | **시리얼키 + 품목코드** |
| **B — 스캔 기기** | **모바일 앱 카메라 · 데스크톱 연결 스캐너 둘 다** |

---

## 결정 A — QR 에는 **시리얼키 + 품목코드**

```
시리얼키   개체 하나를 특정한다 (SI-……)
품목코드   스캔 시점에 품목을 함께 확인해 오스캔을 걸러낸다
```

🚨 **UUID 는 담지 않는다.** UUID 는 사용자에게 어떤 형태로도 노출되지 않는다 — QR 은 사용자가 보고 찍는 물리 매체이므로 노출 표면이다.

🔑 품목코드를 함께 담는 이유는 **오스캔 차단**이다. 시리얼키만 있으면 잘못된 물건을 찍어도 시스템은 알 수 없다. 스캔한 개체의 품목이 작업 대상과 다르면 그 자리에서 막는다.

## 결정 B — **둘 다** (모바일 카메라 + 데스크톱 연결 스캐너)

```
현장 창고    모바일 앱 카메라
검수대·고정 작업대   USB 바코드 스캐너 (키보드 입력으로 들어온다)
```

🔑 **서버 계약은 하나로 두고 입력 경로만 둘**이다. 스캔 기기가 늘어도 서버가 갈라지지 않는다.

⏳ **선행 필요** — 현재 모바일 앱에 QR/바코드 인식기가 없다(카메라 코드는 사진 촬영용). 의존성 추가가 필요하다.

---

## 🔒 이 트랙이 반드시 따라야 할 계약 (정찰 축 D)

`#1203` 이 정리한 수불 정본에 **합류**해야 한다. 🚨 별도 "QR 전용 수불부" 를 만들면 안 된다.

| 업무 | movement | 전표번호 연결 |
|---|---|---|
| 입고전표 / 시리얼 입고 | `INBOUND +` | `reference_type=INBOUND` · 화면은 slipNo |
| 출고전표 / 시리얼 출고 | `DEDUCT -` | `reference_type=SLIP` · 화면은 slipNo |
| 재고이동 출발 | `TRANSFER_OUT -` | `reference_type=STOCK_TRANSFER` · note 의 transferNo |
| 재고이동 도착 | `TRANSFER_IN +` | 동일 |
| 재고실사 | `ADJUST +/-` | `reference_type=AUDIT` · auditNo |

```
전표 귀속 스캔   기존 INBOUND/SLIP reference 와 내부 slip id 를 보존해
                 전표번호 열·클릭 이동이 그대로 동작하게 한다
이동전표 스캔     STOCK_TRANSFER reference 와 TRANSFER_OUT/IN 두 행을 같은 트랜잭션으로
상태 전이 + movement 저장   #1199 와 동일하게 한 트랜잭션
스캔 감사        movement note 에 밀어 넣지 말고 별도 scan session/event
                 새 엔티티라면 BaseEntity 7 + soft delete
```

🚩 **선행 보완 대상** — 현재 이동 확정은 lot 경로만 다뤄 시리얼 개체의 `warehouse_id` 를 옮기지 않는다. QR 이동을 범위에 포함하면 이 분기를 먼저 메워야 한다.

## 🔒 권한 (정찰 축 E)

시리얼 조회·변경 권한은 동적 page-code `inventory.stock-balance` 에 매달려 있다.

| 동작 | action |
|---|---|
| 시리얼 조회·목록 | `VIEW` |
| 수동/배치 입고 인스턴스 생성 | `CREATE` |
| 예약·출고·회수·품질 변경 | `UPDATE` |

🚨 **역할명만으로 최종 허용을 단정하지 마라.** V39 이후 실제 enforcement 는 계정별 `account_page_permissions` 가 정본이고 개인/그룹 override 가 가능하다.

🚩 **선행 확인 2건**
```
① 데스크톱 /inventory/stock-balance route guard 가 다른 page-code
   (accounting.sales-slip.list)를 쓰고 있다 — 스캔 화면을 붙이기 전에 정합 확인
② arologis-mobile 의 DRIVER 인증은 아로로지스 전용 경계다
   inventory.stock-balance 계정 권한을 소비하는 창고 작업자가 아니다
```

## 🔑 없는 것의 정확한 정의 (정찰 문구 정정)

향후 핸드오프에는 이렇게 써야 오해가 없다.

> 일반 재고와 전표 기반 시리얼 배치 mutation 은 존재한다.
> **없는 것은 `serialKey` 로 특정 개체를 스캔 검증하여 입고/출고하고 movement 까지 원자적으로 남기는 mutation 경로다.**

## ⏳ 남은 파생 결정

```
① 전표와 무관한 직접 입출고를 허용할 것인가 (정찰이 결정 사항으로 남김)
② QR 이동을 이번 범위에 포함할 것인가 (포함하면 시리얼 warehouse_id 분기 선행)
```
