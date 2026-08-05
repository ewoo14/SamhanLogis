package com.samhanair.logis.slip.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class SlipCollabNotificationDispatchTest {

    @Test
    void rejectedExecutor_neverRunsExternalNotificationOnRequestThread() throws Exception {
        AtomicBoolean externalCall = new AtomicBoolean();
        Executor rejectingExecutor = command -> {
            throw new RejectedExecutionException("closed");
        };
        SlipCollabEditService service = new SlipCollabEditService(
                mock(SlipCollabSuggestionRepository.class),
                mock(CollabRealtimePublisher.class),
                mock(SlipCollabNotificationOutboxService.class),
                new ObjectMapper(),
                rejectingExecutor);

        Method dispatch = SlipCollabEditService.class.getDeclaredMethod(
                "dispatchNotifications", Runnable.class);
        dispatch.setAccessible(true);
        dispatch.invoke(service, (Runnable) () -> externalCall.set(true));

        assertThat(externalCall).as("executor 거부 뒤 요청 스레드 동기 fallback 금지").isFalse();
    }

    @Test
    void notificationFingerprint_isStableForSameRecipientAndMutation() {
        UUID slipId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID editorId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        assertThat(SlipCollabNotificationOutbox.fingerprint(
                slipId, editorId, "recipient", "subject", "body"))
                .isEqualTo(SlipCollabNotificationOutbox.fingerprint(
                        slipId, editorId, "recipient", "subject", "body"));
    }
}
