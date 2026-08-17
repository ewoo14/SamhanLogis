## SOL 라이브 QA — #1241

해당 head `32862d968`의 `product-service` JAR를 먼저 빌드하고, product-service와 복제 DB만 격리해 캡처했습니다. 인증은 공유 gateway/auth를 사용했고 공유 컨테이너·DB는 변경하지 않았습니다.

### ⑤ 싱글중대형 구성품

- [캡처](screenshots/05-pr1241-single-component-prices.png)
- 구성품 13행
- 판넬 **128,000원**, 리모컨 **16,000원**
- SOL 직전의 멀티 값 104,060원·13,915원에서 확정값 계열로 정상화됐습니다.

### ⑥ 동일 거래처·품목 `AJ060MXHNBC1`·수량 1

- [desktop 캡처](screenshots/06a-pr1241-desktop-same-condition.png): 전표 5행 중 입력 1행, **1,355,640원**
- [estimate-app 캡처](screenshots/06b-pr1241-estimate-app-same-condition.png): 카탈로그 107행 중 선택 1행, **1,523,236원**
- 차이 **167,596원**, estimate-app이 더 큽니다.

⑤는 정상화됐지만 ⑥의 desktop/estimate-app 금액 일치는 아직 달성되지 않았습니다. 격리 컨테이너·프로세스·이미지는 모두 회수했고 공유 24개 컨테이너는 그대로 healthy입니다.

전체 보고서: `docs/qa/2026-08-17-three-pr-live-capture/report.md`
