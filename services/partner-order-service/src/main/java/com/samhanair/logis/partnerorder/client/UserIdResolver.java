package com.samhanair.logis.partnerorder.client;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 주문 협업 알림 수신자 식별자를 push 가능한 사용자 UUID 로 정규화한다.
 *
 * <p>새 데이터는 UUID 문자열을 우선 사용하지만 과거/도메인별 기여 이력에는 loginId(username)가
 * 남아 있을 수 있다. UUID 형식이면 그대로 반환하고, 아니면 auth-service 내부 조회로 accountId 를
 * 확인한다. 조회 실패는 알림 대상 skip 으로 처리한다.
 */
@Slf4j
@Component
public class UserIdResolver {

    private static final Set<String> SYSTEM_ACTOR_LITERALS = Set.of(
            "system",
            "anonymous",
            "schedulertask",
            "batchjob"
    );

    /** zero-UUID: JPA 감사 또는 collab-core 시스템 actor 를 나타내는 특수 UUID. */
    private static final UUID ZERO_UUID = new UUID(0L, 0L);

    private final AuthAccountLookupClient authAccountLookupClient;

    public UserIdResolver(AuthAccountLookupClient authAccountLookupClient) {
        this.authAccountLookupClient = authAccountLookupClient;
    }

    /**
     * raw 식별자를 사용자 UUID 로 변환한다.
     *
     * @param rawUserId UUID 문자열 또는 loginId
     * @return push 수신자 UUID Optional
     */
    public Optional<UUID> resolve(String rawUserId) {
        if (rawUserId == null || rawUserId.isBlank()) {
            return Optional.empty();
        }
        String normalized = rawUserId.trim();
        if (SYSTEM_ACTOR_LITERALS.contains(normalized.toLowerCase(java.util.Locale.ROOT))) {
            log.debug("[PartnerOrderCollab] 시스템 actor 리터럴 skip — rawUserId={}", normalized);
            return Optional.empty();
        }
        try {
            UUID parsed = UUID.fromString(normalized);
            if (ZERO_UUID.equals(parsed)) {
                log.debug("[PartnerOrderCollab] zero-UUID actor skip — rawUserId={}", normalized);
                return Optional.empty();
            }
            return Optional.of(parsed);
        } catch (IllegalArgumentException ignored) {
            Optional<UUID> resolved = authAccountLookupClient.findAccountIdByLoginId(normalized);
            if (resolved == null || resolved.isEmpty()) {
                log.debug("[PartnerOrderCollab] 알림 수신자 loginId resolve 실패 — loginId={}", normalized);
                return Optional.empty();
            }
            return resolved;
        }
    }
}
