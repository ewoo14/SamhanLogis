## SOL 라이브 QA — #1261

해당 head `a224461cd`의 slip/accounting JAR를 먼저 빌드하고, 두 서비스와 복제 DB만 격리했습니다. 인증은 공유 gateway/auth를 사용했으며 입력 화면은 저장하지 않았습니다.

- [⑦ 전표 캡처](screenshots/07-pr1261-slip-half-up.png): 5행 중 입력 1행, 110,005원 → 공급가 **100,005원** / VAT **10,000원**
- [⑧ 견적 캡처](screenshots/08-pr1261-estimate-half-up.png): 2행 중 입력 1행, 110,005원 → 공급가 **100,005원** / VAT **10,000원**

HALF_UP 경계값은 두 화면 라인에 반영됐습니다. 다만 견적 모델명 입력 시 격리 slip의 보조 상품 조회는 아래 응답이므로 완전한 end-to-end 성공으로 확대 해석하면 안 됩니다.

```text
ISOLATED_PROXY GET /slips/lookup-product HTTP 500
No servers available for service: product-service
ProductClient lookupByModel failed: No instances available for product-service
```

격리 컨테이너·프로세스·이미지는 모두 회수했고 공유 24개 컨테이너는 그대로 healthy입니다.

전체 보고서: `docs/qa/2026-08-17-three-pr-live-capture/report.md`
