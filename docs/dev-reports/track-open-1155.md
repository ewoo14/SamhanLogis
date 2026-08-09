연관 Issue: #1155

## 트랙 개설 — PM 정찰 (2026-08-09)

`#1145` R18 이 찾은 선재 결함을 개발책임자 승인으로 분리한 트랙입니다.

### 실측 (집 PC · 공유 `slip_db`)

```text
활성 매입 원천(INBOUND)   61건
거래처 코드 보유           12건 (19.67%)
UUID 만 존재               47건

유일한 CONFIRMED 매입 원천
  slip_no=2026/04/08-1 · INBOUND · CONFIRMED · source_type=MANUAL
  partner_id=SET · partner_code=<EMPTY>
```

### 코드 좌표

```text
services/slip-service/.../domain/Slip.java:149-150   @Column(name="partner_code") private String partnerCode;
services/slip-service/.../domain/Slip.java:978       setPartnerCode(...)  ← PR-E1 BE-1(V15) backfill 용으로 이미 존재
services/slip-service/.../domain/Slip.java:146-148   주석: "partnerCode resolve 는 후속 슬라이스
                                                      (slip 생성/갱신 시점에 partner-service Feign 호출)"
```

⟹ 필드도 setter 도 있고 **생성 경로가 그것을 호출하지 않는 것**이 결함입니다. 주석이 "후속 슬라이스" 라고 예고한 그 슬라이스입니다.

### 반증 — 권한·저장 API 는 정상

`#1145` R18 이 정상 코드를 가진 격리 원천을 실 API 로 마련하자 `MASTER`·`MANAGER`·`ACCOUNTANT` **3/3 이 매입 회계전표 저장에 성공**했습니다. 막는 것은 원천의 빈 `partner_code` 뿐입니다.

### 🚨 계열 — 이번이 네 번째

*조인 키로 쓰는 코드 컬럼이 비어 있고 UUID 만 채워져 있다.* 앞선 셋: 주문 2,024건 중 1건만 조회 · 출고 전환 20건 전부 NULL · 원장 후보 31건 전부 공백(12,276,000원 소실).

공통 성질 — **컴파일·테스트 통과하고 CI green**(fixture 가 양쪽을 다 채움) · 결과가 오류가 아니라 **200 OK 로 빈 값**이라 보류 장치도 못 잡음.
