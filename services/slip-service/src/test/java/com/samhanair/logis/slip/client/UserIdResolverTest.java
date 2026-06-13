package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 협업 알림 수신자 user-id 정규화 테스트.
 *
 * <p>전표 과거 데이터에는 UUID 문자열과 loginId(username) 가 섞여 있을 수 있다. 알림 발송 전
 * {@link UserIdResolver} 가 UUID 는 그대로 통과시키고, loginId 는 auth-service 내부 조회 결과로
 * 변환하며, 실패한 수신자는 best-effort skip 대상으로 비운다.
 */
class UserIdResolverTest {

    @Test
    void resolve_returnsUuidAsIsAndLooksUpLoginId() {
        AuthAccountLookupClient lookupClient = org.mockito.Mockito.mock(AuthAccountLookupClient.class);
        UserIdResolver resolver = new UserIdResolver(lookupClient);
        UUID uuidRecipient = UUID.randomUUID();
        UUID loginAccountId = UUID.randomUUID();
        when(lookupClient.findAccountIdByLoginId("dev_master")).thenReturn(Optional.of(loginAccountId));

        assertThat(resolver.resolve(uuidRecipient.toString())).contains(uuidRecipient);
        assertThat(resolver.resolve("dev_master")).contains(loginAccountId);
    }

    @Test
    void resolve_whenLoginMissing_returnsEmpty() {
        AuthAccountLookupClient lookupClient = org.mockito.Mockito.mock(AuthAccountLookupClient.class);
        UserIdResolver resolver = new UserIdResolver(lookupClient);
        when(lookupClient.findAccountIdByLoginId("missing")).thenReturn(Optional.empty());

        assertThat(resolver.resolve("missing")).isEmpty();
        assertThat(resolver.resolve(" ")).isEmpty();
        assertThat(resolver.resolve(null)).isEmpty();
    }

    /**
     * 시스템 audit 리터럴(JpaAuditingConfig 폴백 {@code "system"} 등)과 zero-UUID(collab-core
     * 시스템 actor)는 by-login 조회 없이 즉시 skip 한다 — 불필요한 auth-service 404/타임아웃 인-트랜잭션
     * 호출 차단 + 시스템 actor 에게 알림 발송 방지 (§7 Round C P2).
     */
    @Test
    void resolve_skipsSystemLiteralsAndZeroUuidWithoutLookup() {
        AuthAccountLookupClient lookupClient = org.mockito.Mockito.mock(AuthAccountLookupClient.class);
        UserIdResolver resolver = new UserIdResolver(lookupClient);

        // 시스템 audit 리터럴 — 대소문자 무관 즉시 skip
        assertThat(resolver.resolve("system")).isEmpty();
        assertThat(resolver.resolve("System")).isEmpty();
        // zero-UUID — UUID 파싱은 성공하나 시스템 actor 이므로 skip
        assertThat(resolver.resolve(new UUID(0L, 0L).toString())).isEmpty();

        // 위 분기는 auth-service by-login 을 호출하지 않아야 한다(불필요 호출 차단)
        org.mockito.Mockito.verifyNoInteractions(lookupClient);
    }
}
