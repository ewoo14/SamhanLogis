# PR #1166 S2 SOL 재검토3 라이브 QA

실제 격리 PostgreSQL 3개와 현재 HEAD의 partner-order/dc-config/slip 서비스를 띄워 수행했다.
공유 `samhan-postgres`에는 SELECT만 실행했다.

| 증거 | 내용 |
|---|---|
| `01-order-confirm-600000-visible.png` | dc-config 정상, 실제 주문 확정·DB 저장 600,000원 |
| `02-order-confirm-dc-down-503-visible.png` | dc-config 프로세스 중단, 실제 503 및 사용자 메시지. 확정 전후 order/line/history/revision 동일 |
| `03-estimate-7-percent-930000-visible.png` | 실제 견적 7%, 930,000원 저장·화면 |
| `04-product-fixed-helper-500-overblocks-order.png` | dc-config 정상인데 불필요한 고정DC 보조 endpoint 500으로 정상 주문 503 오차단 |

최종 실행 원문:

```text
NORMAL orderNo=2026/08/11-3 preview=600000 confirm=600000
DOWN confirmStatus=503 before=orders=2,lines=2,history=5,revisions=2 after=orders=2,lines=2,history=5,revisions=2
ESTIMATE estimateNo=2026/08/11-3 rate=0.07 price=930000
FIXED_HELPER confirmStatus=503 before=orders=3,lines=3,history=8,revisions=3 after=orders=3,lines=3,history=8,revisions=3
```

검증 종료 후 호스트 QA 프로세스와 `sol3-1166-*` 컨테이너 3개는 모두 종료했다.
