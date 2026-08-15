package com.samhanair.logis.notification.seed;

import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationLog;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.repository.NotificationLogRepository;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stage 4 (back-office) local-test seed — notification-service 발송 이력 50건.
 *
 * <p>분포:
 * <ul>
 *   <li>{@link NotificationRequest} 50건 — recipientType USER 30 / PARTNER 15 / EXTERNAL_PHONE 5,
 *       channel PUSH 20 / EMAIL 15 / SMS 15, status PENDING 5 / SENT 35 / FAILED 5 / RETRYING 5</li>
 *   <li>{@link NotificationLog} — SENT/FAILED 40건만 1~2 attempt log 동봉</li>
 * </ul>
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} + {@code app.notification.seed-test-data=true} 둘 다 true 시 실행.
 *
 * <p><b>Idempotency</b>: 결정적 UUID ({@code samhan-seed:notification:&lt;channel&gt;:&lt;seq&gt;}) 로 existsById skip.
 *
 * <p><b>외부 의존</b>:
 * <ul>
 *   <li>USER 30건 — 16 employee loginId 결정 도출 ({@code samhan-seed:employee:&lt;loginId&gt;})</li>
 *   <li>PARTNER 15건 — Stage 1 partner 코드 결정 도출 ({@code samhan-seed:partner:P-2026-NNNN})</li>
 *   <li>EXTERNAL_PHONE 5건 — recipientId null + recipientAddress (010-XXXX-XXXX) 결정</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — recipientId UUID 는 이력 화면에 직접 노출하지 않으며 user-service /
 * partner-service lookup 후 한국어 표시명 매핑.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.notification.seed-test-data", havingValue = "true")
@Order(60)
public class NotificationHistorySeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(NotificationHistorySeeder.class);

    /** 16 employee loginId — USER recipient 30건 라운드로빈. */
    private static final String[] EMPLOYEE_LOGINS = {
            "kimmiseon", "janyeonggu", "obyeongseung", "hongjisu",
            "kimgicheol", "simmigwang", "jeongminguk", "leejiyong",
            "gyeonjinseong", "parkeunwoo", "sinhyeonmin", "leeseongmi",
            "heoyujin", "rahaeram", "kimeunji", "parkjisu"
    };

    /** 본문 템플릿 — 결정적. */
    private static final String[] BODY_TEMPLATES = {
            "전표 %s 가 승인되었습니다.",
            "전표 %s 가 반려되었습니다 — 사유 확인 부탁드립니다.",
            "결재선 %s 처리 요청이 도착했습니다.",
            "거래처 %s 외상매출금이 입금되었습니다.",
            "재고 부족 알림 — %s 모델 5대 미만.",
            "월간 결산 보고서가 준비되었습니다 (%s).",
            "신규 주문 접수 — %s.",
            "출하 완료 알림 — %s.",
            "거래처 %s 단가 변경 안내드립니다.",
            "주간 KPI 보고서 (%s) 가 발행되었습니다."
    };

    private final NotificationRequestRepository requestRepository;
    private final NotificationLogRepository logRepository;

    public NotificationHistorySeeder(NotificationRequestRepository requestRepository,
                                     NotificationLogRepository logRepository) {
        this.requestRepository = requestRepository;
        this.logRepository = logRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        int created = 0;
        int skipped = 0;
        int logCreated = 0;

        for (int seq = 1; seq <= 50; seq++) {
            NotificationChannel channel = pickChannel(seq);
            UUID requestId = deterministicId("notification",
                    channel.name() + ":" + String.format("%02d", seq));
            if (requestRepository.existsById(requestId)) {
                skipped++;
                continue;
            }

            try {
                NotificationRequest request = buildRequest(seq, channel, requestId);
                NotificationStatus targetStatus = pickStatus(seq);
                applyStatus(request, targetStatus);
                NotificationRequest saved = requestRepository.save(request);
                created++;

                // SENT / FAILED 만 log 동봉 (PENDING / RETRYING 은 진행 중 — log 미생성)
                if (targetStatus == NotificationStatus.SENT
                        || targetStatus == NotificationStatus.FAILED) {
                    int attempts = (targetStatus == NotificationStatus.FAILED) ? 2 : 1;
                    for (int a = 1; a <= attempts; a++) {
                        boolean lastFail = (targetStatus == NotificationStatus.FAILED && a == attempts);
                        String gatewayStatus = lastFail ? "FAILURE_TIMEOUT" : "SUCCESS";
                        String messageId = lastFail ? null : "msg-" + seq + "-" + a;
                        String response = lastFail ? "{\"error\":\"upstream timeout\"}"
                                : "{\"ok\":true}";
                        NotificationLog logEntry = NotificationLog.record(saved, a, gatewayStatus,
                                messageId, response);
                        forceId(logEntry, deterministicId("notification-log",
                                requestId + ":" + a));
                        logRepository.save(logEntry);
                        logCreated++;
                    }
                }
            } catch (RuntimeException ex) {
                log.error("Failed to seed notification #{}: {}", seq, ex.getMessage(), ex);
            }
        }

        log.info("NotificationHistorySeeder — created {} requests (skipped {}) + {} logs",
                created, skipped, logCreated);
    }

    // ------------------------------------------------------------------
    // request 생성
    // ------------------------------------------------------------------

    private NotificationRequest buildRequest(int seq, NotificationChannel channel, UUID requestId) {
        RecipientType recipientType = pickRecipientType(seq);
        UUID recipientId = null;
        String recipientAddress = null;
        String subject = null;
        String body = String.format(BODY_TEMPLATES[(seq - 1) % BODY_TEMPLATES.length],
                pickContextToken(seq));
        String payload = String.format(
                "{\"slipNo\":\"2026/05/%02d-%d\",\"actor\":\"%s\"}",
                ((seq - 1) % 28) + 1, ((seq - 1) % 9) + 1,
                EMPLOYEE_LOGINS[(seq - 1) % EMPLOYEE_LOGINS.length]);

        switch (recipientType) {
            case USER -> {
                String loginId = EMPLOYEE_LOGINS[(seq - 1) % EMPLOYEE_LOGINS.length];
                recipientId = deterministicId("employee", loginId);
                if (channel == NotificationChannel.EMAIL) {
                    recipientAddress = loginId + "@samhan-air.com";
                    subject = "[삼한공조] " + body;
                } else if (channel == NotificationChannel.SMS) {
                    recipientAddress = makeMobile(seq);
                }
            }
            case PARTNER -> {
                int partnerSeq = ((seq - 1) % 50) + 1;
                String partnerCode = String.format("P-2026-%04d", partnerSeq);
                recipientId = deterministicId("partner", partnerCode);
                if (channel == NotificationChannel.EMAIL) {
                    recipientAddress = "info" + partnerSeq + "@samhan-test.com";
                    subject = "[삼한공조 거래처 알림] " + body;
                } else if (channel == NotificationChannel.SMS) {
                    recipientAddress = makeMobile(partnerSeq);
                }
            }
            case EXTERNAL_PHONE -> {
                recipientAddress = makeMobile(seq + 100);
                // EXTERNAL_PHONE 은 SMS 만 정상 — channel 강제 SMS
                channel = NotificationChannel.SMS;
            }
            default -> { /* unreachable */ }
        }

        String templateCode = switch (recipientType) {
            case USER -> "USER_NOTI";
            case PARTNER -> "PARTNER_NOTI";
            case EXTERNAL_PHONE -> "OTP_SMS";
            case EXTERNAL_EMAIL -> "EXTERNAL_EMAIL";
        };

        NotificationRequest request = NotificationRequest.open(recipientType, recipientId,
                recipientAddress, channel, templateCode, subject, body, payload);
        forceId(request, requestId);
        return request;
    }

    /** status 분포 — PENDING 5 / SENT 35 / FAILED 5 / RETRYING 5. */
    private NotificationStatus pickStatus(int seq) {
        // seq 1~5 PENDING / 6~40 SENT / 41~45 FAILED / 46~50 RETRYING
        if (seq <= 5) {
            return NotificationStatus.PENDING;
        }
        if (seq <= 40) {
            return NotificationStatus.SENT;
        }
        if (seq <= 45) {
            return NotificationStatus.FAILED;
        }
        return NotificationStatus.RETRYING;
    }

    private void applyStatus(NotificationRequest request, NotificationStatus target) {
        switch (target) {
            case PENDING -> { /* default state */ }
            case SENT -> request.markSent();
            case FAILED -> {
                request.markFailed(true);   // 1차 fail (RETRYING)
                request.markFailed(false);  // 2차 fail (FAILED — 종료)
            }
            case RETRYING -> request.markFailed(true);
            default -> { /* unreachable */ }
        }
    }

    /** channel 분포 — PUSH 20 / EMAIL 15 / SMS 15. */
    private NotificationChannel pickChannel(int seq) {
        if (seq <= 20) {
            return NotificationChannel.PUSH;
        }
        if (seq <= 35) {
            return NotificationChannel.EMAIL;
        }
        return NotificationChannel.SMS;
    }

    /** recipientType 분포 — USER 30 / PARTNER 15 / EXTERNAL_PHONE 5. */
    private RecipientType pickRecipientType(int seq) {
        if (seq <= 30) {
            return RecipientType.USER;
        }
        if (seq <= 45) {
            return RecipientType.PARTNER;
        }
        return RecipientType.EXTERNAL_PHONE;
    }

    /** 본문 % 자리 채울 token — 결정적. */
    private String pickContextToken(int seq) {
        return String.format("2026/05/%02d-%d",
                ((seq - 1) % 28) + 1, ((seq - 1) % 9) + 1);
    }

    private static String makeMobile(int seq) {
        int mid = 1000 + (seq * 19) % 9000;
        int tail = 1000 + (seq * 47) % 9000;
        return String.format("010-%04d-%04d", mid, tail);
    }

    // ------------------------------------------------------------------
    // 공용
    // ------------------------------------------------------------------

    static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8));
    }

    private static void forceId(Object entity, UUID id) {
        try {
            Class<?> clazz = entity.getClass();
            Field f = null;
            while (clazz != null && f == null) {
                try {
                    f = clazz.getDeclaredField("id");
                } catch (NoSuchFieldException nsfe) {
                    clazz = clazz.getSuperclass();
                }
            }
            if (f == null) {
                throw new NoSuchFieldException("id");
            }
            f.setAccessible(true);
            f.set(entity, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to set deterministic id on "
                    + entity.getClass().getSimpleName(), e);
        }
    }
}
