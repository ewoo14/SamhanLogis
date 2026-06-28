# DEV-2 팝업공지 — Codex 라운드 실서버 QA (mock OFF · 실 게이트웨이:8080 JWT · 실 dashboard · 실 PG)

재빌드 dashboard(323d7ad67+3922666d7), profile=dev, MinIO 비활성(Noop). 로그인=dev_master(MASTER).

## 1) 로그인 OK (dev_master=MASTER, JWT 발급)

## 2) 공지 등록 (POST /app/notices) → noticeId=3d30240c-ac53-4e9a-9c00-0b5f0535549c
```json
{"success":true,"code":"OK","message":"성공","data":{"id":"3d30240c-ac53-4e9a-9c00-0b5f0535549c","title":"실QA 팝업공지","isActive":true,"startAt":"2026-06-28T00:00:00","endAt":"2026-12-31T23:59:59","displayOrder":5,"images":[]},"timestamp":"2026-06-28T06:35:37.446427456Z"}
```

## 3) magic-byte 검증 — 가짜 바이트+image/png 업로드 → 거부 기대 (M-2)
```
{"success":false,"code":"INVALID_INPUT","message":"허용되지 않은 이미지 형식입니다.","data":null,"timestamp":"2026-06-28T06:35:37.822817227Z"}
[HTTP 400]
```

## 4) 정상 PNG 업로드 → 200 + 원본 fileName(notice.png)=M-6 + placeholder URL(Noop graceful=M-4·key 미노출=B-1)
```
{"success":true,"code":"OK","message":"성공","data":{"id":"c2921ad3-41d3-4ee1-8275-006a25376013","imageUrl":"about:blank#app-notice-noop","fileName":"notice.png","displayOrder":1,"caption":"QA-real-banner"},"timestamp":"2026-06-28T06:35:38.194613495Z"}
[HTTP 200]
```

## 5) admin 목록 (GET /app/notices) — fileName(원본명) 노출 확인 (M-6)
```json
{"success":true,"code":"OK","message":"성공","data":[{"id":"3d30240c-ac53-4e9a-9c00-0b5f0535549c","title":"실QA 팝업공지","isActive":true,"startAt":"2026-06-28T00:00:00","endAt":"2026-12-31T23:59:59","displayOrder":5,"images":[{"id":"c2921ad3-41d3-4ee1-8275-006a25376013","imageUrl":"about:blank#app-notice-noop","fileName":"notice.png","displayOrder":1,"caption":"QA-real-banner"}]}],"timestamp":"2026-06-28T06:35:38.510400437Z"}
```

## 6) active 조회 (GET /app/notices/active) — imageUrl=placeholder, object key 미노출 (B-1)
```json
{"success":true,"code":"OK","message":"성공","data":[{"id":"3d30240c-ac53-4e9a-9c00-0b5f0535549c","title":"실QA 팝업공지","isActive":true,"startAt":"2026-06-28T00:00:00","endAt":"2026-12-31T23:59:59","displayOrder":5,"images":[{"imageUrl":"about:blank#app-notice-noop","displayOrder":1,"caption":"QA-real-banner"}]}],"timestamp":"2026-06-28T06:35:38.830762271Z"}
```

✅ active 응답에 object key('app-notices/') 미노출

## 7) cleanup soft-delete → {"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-06-28T06:35:39.305064084Z"}[HTTP 200]

_생성 공지는 soft-delete 로 정리._
