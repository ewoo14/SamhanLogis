# PR #1082 · 이슈 #1051 — SOL 5.6 4차 적대검증 (R3 재수렴)

> 검증 HEAD: `f907585cf`
> 판정: **도달 결함 1건 · 머지 불가**
> 제한 준수: git 쓰기 0, 라이브 HTTP 요청 0, DB 쓰기 0, 컨테이너 재빌드·재시작 0

## 1. 도달 결함 — D4-1

**실제 `PRICE` 주문을 `VAT`로 위조해 수량·납품가 편집이 다른 계산 경로를 탄다.**

### 실 사용자 도달 경로

1. 본사 `MASTER`·`MANAGER`·`SALES` 사용자가 주문 `2026/07/30-1`을 연다.
2. `AWR-WE13N` 라인의 수량을 2→3으로 변경하거나 납품가를 수정한다.
3. GET은 S/V 존재만 보고 `authority: "VAT"`를 반환한다.
4. 화면은 보이지 않는 `VAT` 권위와 기존 S/V를 PUT으로 되돌려 보낸다.
5. 서버는 사용자가 편집한 납품가가 아니라 기존 S/V를 권위값으로 사용한다.

```text
원래: 수량 2 · 단가 45,375 · S 82,500 · V 8,250 · T 90,750

수량 3으로 편집
PRICE 경로 기대: T = 45,375 × 3 = 136,125
현재 VAT 경로:   T = 82,500 + 8,250 = 90,750
                 단가가 90,750 ÷ 3 = 30,250 으로 역산됨
```

납품가만 바꾸면 그 편집값은 VAT 경로에서 무시된다.

### 근거

- 실 DB의 S/V 라인은 3건이다.
- `2026/07/30-1` 두 라인은 `PO-CONF-1068689215-1`·`CONFIRMED` provenance 를 가진다.
- 확정 경로는 `PartnerOrderConfirmService.java:233` 의 `PartnerOrderLine.create(...)`, 즉 `PRICE` 권위다.
- 그런데 `PartnerOrderDetailResponse.java:189` 는 S/V 가 있으면 무조건 `"VAT"` 를 반환한다.
- 화면은 authority 와 S/V 를 그대로 PUT 한다: `SalesPartnerOrderDetailPage.tsx:1419`.
- VAT 계산은 S/V 로 합계를 재구성한다: `PartnerOrderLine.java:195`.

### 실데이터 authority 분포 정정

```text
S/V 저장 라인               3
현재 권위가 PRICE 임을 입증   2
현재 권위가 VAT 임을 입증     0
SUPPLY/TOTAL 입증            0
QA 변경으로 현재 권위 불명    1
```

영속 데이터와 revision snapshot 모두 authority 를 갖지 않으므로 3건 전체의 실제 권위 분포를
DB 에서 세는 것은 불가능하다.

## 2. PM 재검증 (릴레이 아님 — 코드 직접 확인)

SOL 의 핵심 주장 3개를 PM 이 원문에서 직접 확인했다.

```text
① PartnerOrderDetailResponse.java:189
   line.getSupplyAmount() != null || line.getVatAmount() != null ? "VAT" : null
   → S/V 존재만으로 "VAT" 를 박는다. 확인.

② PartnerOrderLine.java:152-156  (7-arg create)
   return createFromAuthoritativeAmounts(..., null, null, null,
                                         AmountAuthority.PRICE, remark);
   → 기본 권위 PRICE. 확인.

③ PartnerOrderConfirmService.java:233
   PartnerOrderLine entity = PartnerOrderLine.create(
           p.id(), lineModelCode, p.name(), line.categoryKey(),
           line.quantity(), priceVat, line.remark());
   → 7-arg 오버로드 사용 ⟹ PRICE 로 생성. 확인.

④ PartnerOrderLine.java — authority 에 @Column 없음 (grep 0건)
   → 권위가 영속되지 않는다. 확인.
```

**근본 원인 확정**: 권위가 영속되지 않아 엔티티가 자기 권위를 잊고,
GET 이 S/V 존재만으로 권위를 되추측한다. 되추측 규칙이 실제 생성 권위와 무관하다.

### PM 자기 정정

R3 에서 PM 이 `authority: "VAT"` 하드코딩을 수용한 것이 이 결함을 만들었다.
D3-1(정상 왕복 422)을 닫으려고 "S/V 가 있으면 VAT 로 왕복시킨다" 를 받아들였는데,
그 전제인 **"S/V 가 있는 라인은 VAT 로 만들어졌다"** 를 실측하지 않았다.
실제로는 3건 중 2건이 PRICE 로 만들어졌고 VAT 로 만들어진 것은 0건이다.

## 3. Best-effort orphan 경계 (결함 아님)

카탈로그 장애가 orphan 을 문자 그대로 영구화하지는 않는다.

- 장애 중 저장: 기존 orphan ID 를 보존하고 헤더 변경은 성공한다.
- 카탈로그 복구 후: 사용자가 memo·비고 등 실제 변경을 한 번 더 저장하면 lookup 이 다시 실행된다.
- 변경 없이 저장하면 `changes.isEmpty()` 에서 반환하므로 복구는 실행되지 않는다.
- 모델 표현이 카탈로그와 맞지 않으면 사용자가 화면에서 모델명을 canonical 값으로 교정해야 한다.

따라서 "영영 고칠 수 없음" 은 아니지만 자동 재시도나 명시적 복구 동작은 없다.
현재 orphan 표본은 PR #1097 정리 계열과 QA 오염분이어서 결함 건수로 세지 않았다.

## 4. 나머지 경계

- 금액 비교의 `compareTo()` 는 `1000` 과 `1000.00` 을 동일하게 처리한다.
- `null` 과 `0` 은 서로 다른 값으로 판정되며 정상 화면 왕복에서는 그대로 보존된다.
- 음수 S/V/T 는 권위별 도메인 검증에서 차단된다.
- 납품가·수량 편집 오류는 독립 결함이 아니라 D4-1 의 잘못된 VAT 권위에서 발생한다.
- composite 중복은 실 DB 에서 `duplicate_groups=0`, `duplicate_lines=0` 이었다.
  따라서 결함 0 이 아니라 **판정 불가**다. 코드상 동일 키가 존재하면 순서대로 소비한 기존
  라인을 다시 단일 key map 에 덮어쓰므로, 서로 다른 productId 를 가진 중복 라인은
  lookup 실패 시 한 ID 로 합쳐질 위험이 남는다.

## 5. Fix 지시서 — 불변식만

1. 주문 라인의 생성·편집 권위는 GET→편집→PUT→재조회 전 과정에서 손실되거나
   다른 권위로 바뀌지 않아야 한다.
2. `PRICE` 라인의 수량 변경은 기존 단가를 유지하며 합계를 수량에 맞춰 바꿔야 한다.
3. 사용자가 화면의 납품가를 변경해 저장하면 저장 결과에 그 변경이 반영되거나 명시적으로
   거절돼야 한다. 성공하면서 편집값을 버리면 안 된다.
4. memo·납기·비고만 변경한 왕복은 단가·수량·S/V/T·권위를 모두 보존해야 한다.
5. `SUPPLY`·`VAT`·`TOTAL` 라인도 각각 자신의 권위와 금액 항등식을 유지해야 한다.
6. revision 복원 후에도 복원 전 권위와 이후 편집 계산 결과가 같아야 한다.

### 양방향 RED

- `PRICE` 로 생성된 S/V 라인 → GET authority 는 `PRICE`; 수량 2→3 이면 단가 유지·합계 증가.
- 같은 라인 → 납품가 편집값이 저장 금액에 반영.
- `SUPPLY`·`VAT`·`TOTAL` 각각 → 왕복 후 authority 불변, 권위별 재계산 결과 단정.
- 각 권위에서 memo-only → 모든 금액 불변.
- authority 가 변조된 PUT → 조용히 다른 계산으로 성공하지 않고 주문 전체 불변.
- revision 복원 전후 → 동일 편집 입력의 결과가 동일.

## 6. 이번 라운드가 보지 않은 것

- 라이브 PUT/POST 와 전표 전환 실행
- 컨테이너의 exact HEAD 동작
- 실제 중복 composite 표본
- PR #1097 적용 이후 데이터
- 저장되지 않은 authority 의 완전한 과거 분포

`origin/main...HEAD` 의 변경 파일 13개를 전수 확인했다. git·DB·컨테이너 쓰기는 없었고
신규 파일도 만들지 않았다.
