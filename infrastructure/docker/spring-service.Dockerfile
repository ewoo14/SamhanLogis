# SamhanLogis local-all Spring Boot runtime image.
#
# The MIG-23 launcher builds service bootJar artifacts on the host first, then
# this image copies exactly one jar into a small JRE runtime. This keeps the
# local Docker Compose overlay uniform even for services that do not own a
# service-specific Dockerfile yet.
FROM eclipse-temurin:17-jre-alpine

ARG JAR_FILE

RUN apk add --no-cache curl \
    && addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /app /logs \
    && chown -R app:app /app /logs

WORKDIR /app

# MIG-23 사이클 1e fix (Codex Performance MINOR) — RUN chown 별도 layer 회피.
COPY --chown=app:app ${JAR_FILE} /app/app.jar

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fs http://localhost:${SERVER_PORT:-8080}/actuator/health || exit 1

ENTRYPOINT ["java","-jar","/app/app.jar"]
