package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 주문 협업 알림 수신자 식별자 정규화 테스트.
 *
 * <p>주문 생성/버전/댓글/수정 이력에는 UUID 문자열과 loginId(username)가 섞일 수 있다.
 * 알림 발송 전 {@link UserIdResolver} 가 UUID 는 그대로 통과시키고, loginId 는 auth-service
 * 내부 조회 결과로 변환하며, 시스템 actor 는 원격 호출 없이 제외하는 계약을 고정한다.
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

    /** 시스템 audit 리터럴과 zero-UUID 는 by-login 조회 없이 즉시 skip 한다. */
    @Test
    void resolve_skipsSystemLiteralsAndZeroUuidWithoutLookup() {
        AuthAccountLookupClient lookupClient = org.mockito.Mockito.mock(AuthAccountLookupClient.class);
        UserIdResolver resolver = new UserIdResolver(lookupClient);

        assertThat(resolver.resolve("system")).isEmpty();
        assertThat(resolver.resolve("System")).isEmpty();
        assertThat(resolver.resolve(new UUID(0L, 0L).toString())).isEmpty();

        org.mockito.Mockito.verifyNoInteractions(lookupClient);
    }
}
