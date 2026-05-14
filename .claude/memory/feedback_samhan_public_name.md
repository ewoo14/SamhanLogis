---
name: samhan-public-name
description: 기존 14 service 묶음 (모노레포 전체) 의 정식 호칭은 "Samhan Public" (삼한 퍼블릭) — "SamhanLogis" 는 폴더/working dir 명일 뿐
metadata:
  type: feedback
---

기존 14 service 묶음 (eureka / api-gateway / auth / user / product / inventory / slip / accounting / logging / partner-auth / dc-config / partner-order / partner / groupware / notification / dashboard) 의 정식 호칭은 **"Samhan Public"** (삼한 퍼블릭).

**Why:** 2026-05-14 사용자 명시 정정 — "SamhanLogis" 는 폴더/repo working dir 명 (C:\dev\SamhanLogis) 이며, 외부 문서/PR/설계서/UI 호칭은 "Samhan Public". 회사명/조직명 일관 유지.

**How to apply:**
- PR/Issue/spec/dev-report/README/UI 라벨/도메인 안내 등 **외부 호칭** = "Samhan Public" (영문) / "삼한 퍼블릭" (한글)
- 코드 package (`com.samhanair.logis.*`), 폴더 (`C:\dev\SamhanLogis`), repo 이름 (`samhan-logis`), settings.gradle `rootProject.name` 등 **내부 식별자**는 그대로 (재명명 비용 회피)
- 아로로지스는 Samhan Public 의 마이크로서비스 → 독립 서비스 분리 시 "Samhan Public 의 일부였던 arologis-service 를 독립 운영 단위로 분리" 라고 표현
