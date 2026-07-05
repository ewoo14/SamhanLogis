# 2026-07-06 — #22(#587·#531) X-Internal-Token audit + RestClient 계약테스트 (PR 예정)

> 최근 #25(X-Is-System-Master 누락)·#26(URL 불일치)·#720·#28(config)이 서비스간 client 결함 다수 적발 → 동종 계열 전수 audit + 계약테스트 보강.

## 스코프
- **#587 X-Internal-Token audit**: 전 서비스간 RestClient(X-Internal-Token·INTERNAL_TOKEN_HEADER·requireToken) 전수 — (a)/internal 호출 시 토큰 전송 (b)X-Is-System-Master 필요한데 누락(#25 계열) (c)URL/body 계약 불일치(#26/#720 계열). 결함 발견 시 fix.
- **#531 RestClient 계약테스트**: 계약테스트(*ClientTest MockRestServiceServer·URI+헤더+body+상태 4체크·@MockBean 우회 금지) 부재 서비스간 client에 추가(우선 accounting/slip/partner-order/notification 미보유분).

## 계획
- grep 전수 → client별 (수신 컨트롤러 실 .uri()·헤더·토큰) 대조 표.
- 계약테스트 RED→GREEN(URL 되돌림·헤더 삭제 시 fail 실증·false-green 방지).
- 검증: 대상 모듈 :test --rerun-tasks.

## 리뷰
Opus 5-agent↔Codex 5-agent(라이브·권한 enforcement 실HTTP)·0수렴·9-게이트. 연관 Issue: #587·#531.
