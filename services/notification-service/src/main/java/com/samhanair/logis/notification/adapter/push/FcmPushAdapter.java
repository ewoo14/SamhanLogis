package com.samhanair.logis.notification.adapter.push;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.Message;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.config.FcmProperties;
import com.samhanair.logis.notification.domain.NotificationRequest;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * FCM (Firebase Cloud Messaging) 어댑터.
 *
 * <p>credentials 가 dev placeholder 인 경우 즉시 success 반환 (로컬 dev / dev-default 환경 지원).
 * 실제 credentials base64 또는 path 가 주입된 경우 Firebase Admin SDK 를 1회 초기화하고 FCM 으로 발송한다.
 *
 * <p>Firebase service-account JSON 은 환경변수/시크릿으로만 주입한다. repo 에 google-services.json,
 * GoogleService-Info.plist, service-account JSON 을 커밋하지 않는다.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "samhan.notification.fcm", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FcmPushAdapter implements PushAdapter {

    private static final String APP_NAME = "samhan-notification-fcm";

    private final FcmProperties properties;
    private volatile FirebaseMessaging firebaseMessaging;

    public FcmPushAdapter(FcmProperties properties) {
        this.properties = properties;
    }

    @Override
    public NotificationGatewayResult send(NotificationRequest request) {
        return sendToToken(request, request.getRecipientAddress());
    }

    @Override
    public NotificationGatewayResult sendToToken(NotificationRequest request, String token) {
        try {
            if (!hasRealCredentials()) {
                String stubId = stubMessageId(request, token);
                log.debug("[FcmPushAdapter] FCM credentials placeholder — stub success requestId={} stubId={}",
                        request.getId(), stubId);
                return NotificationGatewayResult.success(stubId,
                        "{\"note\":\"FCM stub\",\"token\":\"" + escape(token) + "\"}");
            }
            if (token == null || token.isBlank()) {
                return NotificationGatewayResult.failure("FAILURE_FCM_TOKEN_MISSING",
                        "{\"error\":\"FCM token missing\"}");
            }
            String messageId = messaging().send(buildMessage(request, token));
            return NotificationGatewayResult.success(messageId,
                    "{\"messageId\":\"" + escape(messageId) + "\",\"token\":\"" + escape(token) + "\"}");
        } catch (Exception ex) {
            log.warn("[FcmPushAdapter] 호출 실패 requestId={} msg={}", request.getId(), ex.getMessage());
            return NotificationGatewayResult.failure("FAILURE_FCM", ex.getMessage());
        }
    }

    private Message buildMessage(NotificationRequest request, String token) {
        Message.Builder builder = Message.builder()
                .setToken(token)
                .putData("requestId", String.valueOf(request.getId()))
                .putData("eventId", request.getIdempotencyKey() == null
                        ? String.valueOf(request.getId()) : request.getIdempotencyKey());
        if (request.getTemplateCode() != null) {
            builder.putData("templateCode", request.getTemplateCode());
        }
        if (request.getPayload() != null) {
            builder.putData("payload", request.getPayload());
        }
        if (request.getSubject() != null || request.getBody() != null) {
            builder.setNotification(com.google.firebase.messaging.Notification.builder()
                    .setTitle(request.getSubject())
                    .setBody(request.getBody())
                    .build());
        }
        return builder.build();
    }

    private FirebaseMessaging messaging() throws IOException {
        FirebaseMessaging current = firebaseMessaging;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (firebaseMessaging == null) {
                FirebaseApp app = findExistingApp();
                if (app == null) {
                    try (InputStream inputStream = credentialsStream()) {
                        FirebaseOptions.Builder options = FirebaseOptions.builder()
                                .setCredentials(GoogleCredentials.fromStream(inputStream));
                        if (!isPlaceholder(properties.getProjectId())) {
                            options.setProjectId(properties.getProjectId().trim());
                        }
                        app = FirebaseApp.initializeApp(options.build(), APP_NAME);
                    }
                    log.info("[FcmPushAdapter] Firebase Admin SDK 초기화 완료 app={}", APP_NAME);
                }
                firebaseMessaging = FirebaseMessaging.getInstance(app);
            }
            return firebaseMessaging;
        }
    }

    private FirebaseApp findExistingApp() {
        for (FirebaseApp app : FirebaseApp.getApps()) {
            if (APP_NAME.equals(app.getName())) {
                return app;
            }
        }
        return null;
    }

    private boolean hasRealCredentials() {
        return !isPlaceholder(properties.getCredentialsBase64())
                || !isPlaceholder(properties.getCredentialsPath());
    }

    private InputStream credentialsStream() throws IOException {
        if (!isPlaceholder(properties.getCredentialsBase64())) {
            byte[] decoded = Base64.getDecoder().decode(properties.getCredentialsBase64().trim());
            return new ByteArrayInputStream(decoded);
        }
        return new FileInputStream(properties.getCredentialsPath().trim());
    }

    private static boolean isPlaceholder(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return normalized.equals("change_me_local_only")
                || normalized.equals("placeholder_dev_only")
                || normalized.equals("changeme")
                || normalized.equals("dummy")
                || normalized.equals("placeholder")
                || normalized.contains("change-me")
                || normalized.contains("local-only");
    }

    private static String stubMessageId(NotificationRequest request, String token) {
        if (token == null || token.isBlank()) {
            return "fcm-stub-" + request.getId();
        }
        return "fcm-stub-" + request.getId() + "-" + Integer.toHexString(token.hashCode());
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }
}
