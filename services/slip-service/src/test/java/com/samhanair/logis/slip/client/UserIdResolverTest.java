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
}
