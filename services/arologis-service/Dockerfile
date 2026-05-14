# 아로로지스 (Samhan Public) — arologis-service image (spec §8.4 — 2026-05-14).
# 다른 Samhan Public service Dockerfile 와 동일한 패턴 (single-stage, non-root user, healthcheck 내장).
# JAR 빌드 = GitHub Actions 의 ./gradlew :services:arologis-service:bootJar 단계에서 사전 수행.
FROM eclipse-temurin:17-jre-alpine

ARG JAR_FILE=build/libs/arologis-service.jar

RUN apk add --no-cache curl \
    && addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /app \
    && chown -R app:app /app

WORKDIR /app

COPY ${JAR_FILE} /app/app.jar
RUN chown app:app /app/app.jar

USER app

EXPOSE 8097

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8097/actuator/health || exit 1

ENTRYPOINT ["java","-jar","/app/app.jar"]
