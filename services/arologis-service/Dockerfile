# 아로로지스 (Samhan Public) — arologis-service image.
#
# Phase F (D-DF-06) — multi-stage build:
#   Stage 1: print-renderer 정적 산출물 빌드 (Vite multi-entry — Phase F 사본 합성용 출고전표 양식).
#   Stage 2: arologis-service Java + Playwright Chromium + 한글 폰트 + print-renderer/ 동봉.
#
# 기존 single-stage Alpine + non-root + healthcheck 패턴 유지하되,
# Playwright Chromium 의존성 (libnss3 등) + 한글 폰트 (fonts-noto-cjk) 가 Alpine
# 패키지로 안정 제공되지 않아 Stage 2 base 를 jammy (Ubuntu) 로 전환.
# Spec §6 + plan DO1 참조.

# ---------------------------------------------------------------------
# Stage 1 — clients/desktop print-renderer 정적 빌드.
# 산출물: /build/dist/print-renderer/index.html + JS/CSS bundle.
# ---------------------------------------------------------------------
FROM node:20-bookworm-slim AS print-renderer-builder

# design-system workspace 의존성 (file:../web/design-system) 우선 빌드 → dist/ 산출 후
# desktop 의 npm ci 가 file:../web/design-system 을 정상 resolve 가능.
WORKDIR /web/design-system
COPY clients/web/design-system/package.json clients/web/design-system/package-lock.json ./
RUN npm ci
COPY clients/web/design-system ./
RUN npm run build

WORKDIR /build/clients/desktop

# package*.json 만 먼저 복사 → npm ci 캐시 hit.
COPY clients/desktop/package.json clients/desktop/package-lock.json ./
RUN npm ci

# clients/desktop 전체 복사 (소스 + vite.print-renderer.config.ts + print-renderer/).
COPY clients/desktop ./

# print-renderer 만 별도 vite.config 로 빌드 → dist/print-renderer/.
RUN npm run build:print-renderer

# ---------------------------------------------------------------------
# Stage 2 — arologis-service Java + Playwright Chromium + 한글 폰트.
# ---------------------------------------------------------------------
FROM eclipse-temurin:17-jdk-jammy AS arologis-runtime

ARG JAR_FILE=services/arologis-service/build/libs/arologis-service.jar

# Chromium 의존성 (libnss3 등) + 한글 폰트 (fonts-noto-cjk).
# curl 은 healthcheck 용. fonts-noto-cjk 는 출고전표 한글 렌더 정확도 확보 (Phase F D-DF-06).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates \
        libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
        libcairo2 libasound2 \
        fonts-noto-cjk fonts-noto-cjk-extra \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app \
    && useradd -r -g app -d /app -s /sbin/nologin app \
    && mkdir -p /app /var/lib/arologis/signature-copies \
    && chown -R app:app /app /var/lib/arologis/signature-copies

WORKDIR /app

# JAR 빌드 = GitHub Actions 의 ./gradlew :services:arologis-service:bootJar 단계에서 사전 수행.
COPY ${JAR_FILE} /app/app.jar

# Playwright Chromium 다운로드 (이미지 빌드 시점 1회).
# Spring Boot fat JAR 안의 Playwright Java SDK 클래스 (com.microsoft.playwright.CLI) 를 직접 호출.
# 실패 시 (CLI 누락) Maven Central 의 playwright JAR 를 fallback 으로 받아 install.
# install 산출물 = /root/.cache/ms-playwright/ (root user). 본 이미지는 USER app 으로 전환하므로
# 캐시를 /app/.cache 로 옮겨 app 사용자가 읽을 수 있도록 함.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
RUN mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}" \
    && ( \
        java -cp /app/app.jar -Dloader.main=com.microsoft.playwright.CLI org.springframework.boot.loader.PropertiesLauncher install chromium \
        || java -cp /app/app.jar com.microsoft.playwright.CLI install chromium \
        || ( \
            echo "[arologis] Playwright CLI 진입점 미발견 — Maven Central JAR fallback" \
            && curl -fsSL "https://repo1.maven.org/maven2/com/microsoft/playwright/playwright/1.47.0/playwright-1.47.0.jar" -o /tmp/playwright.jar \
            && curl -fsSL "https://repo1.maven.org/maven2/com/microsoft/playwright/driver-bundle/1.47.0/driver-bundle-1.47.0.jar" -o /tmp/driver-bundle.jar \
            && java -cp /tmp/playwright.jar:/tmp/driver-bundle.jar com.microsoft.playwright.CLI install chromium \
            && rm -f /tmp/playwright.jar /tmp/driver-bundle.jar \
        ) \
    ) \
    && chown -R app:app "${PLAYWRIGHT_BROWSERS_PATH}"

# print-renderer 정적 산출물 동봉 (file:// URL 로 Playwright 가 로드).
COPY --from=print-renderer-builder /build/clients/desktop/dist/print-renderer /app/print-renderer
RUN chown -R app:app /app/print-renderer /app/app.jar

# 사본 PNG 디스크 마운트 포인트 (Phase 11 cutover 시 S3 키로 갈아탐).
VOLUME ["/var/lib/arologis/signature-copies"]

# Phase F (D-DF-01/06/10) — 아래 4 env 가 SignAndSendCopyService / PlaywrightCopyRenderer / CopyImageDiskStorage 에 주입됨.
ENV AROLOGIS_SIGNATURE_COPY_DIR=/var/lib/arologis/signature-copies
ENV AROLOGIS_PRINT_RENDERER_URL=file:///app/print-renderer/index.html
ENV AROLOGIS_PLAYWRIGHT_TIMEOUT_MS=8000
ENV SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false

USER app

EXPOSE 8097

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8097/actuator/health || exit 1

ENTRYPOINT ["java","-jar","/app/app.jar"]
