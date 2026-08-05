package com.samhanair.logis.slip.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.UserIdResolver;
import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
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

    @Test
    void concurrentDrains_claimTheSameReadyRowOnlyOnce() throws Exception {
        SlipCollabNotificationOutboxRepository repository = mock(SlipCollabNotificationOutboxRepository.class);
        UserIdResolver resolver = mock(UserIdResolver.class);
        NotificationClient client = mock(NotificationClient.class);
        SlipCollabNotificationOutbox row = SlipCollabNotificationOutbox.create(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "recipient", "subject", "body");
        CountDownLatch bothReaders = new CountDownLatch(2);
        AtomicInteger reads = new AtomicInteger();
        when(repository.findTop100ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
                org.mockito.ArgumentMatchers.anyList(), org.mockito.ArgumentMatchers.any(LocalDateTime.class)))
                .thenAnswer(invocation -> {
                    if (reads.incrementAndGet() <= 2) {
                        bothReaders.countDown();
                        bothReaders.await();
                        return List.of(row);
                    }
                    return List.of();
                });
        when(repository.save(row)).thenReturn(row);
        when(repository.claim(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any())).thenReturn(1, 0);
        when(repository.findById(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(row));
        when(resolver.resolve("recipient")).thenReturn(Optional.of(UUID.randomUUID()));
        when(client.sendUserPushWithResult(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any()))
                .thenReturn(true);

        SlipCollabNotificationOutboxService service = new SlipCollabNotificationOutboxService(
                repository, resolver, client);
        Executor executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        executor.execute(service::drainPending);
        executor.execute(service::drainPending);
        ((java.util.concurrent.ExecutorService) executor).shutdown();
        org.assertj.core.api.Assertions.assertThat(((java.util.concurrent.ExecutorService) executor)
                .awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();

        org.mockito.Mockito.verify(client, org.mockito.Mockito.times(1))
                .sendUserPushWithResult(org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.eq("subject"), org.mockito.ArgumentMatchers.eq("body"),
                        org.mockito.ArgumentMatchers.any());
    }

    @Test
    void samePayloadFromDifferentSuccessfulEdits_keepsTwoIndependentOutboxRows() throws Exception {
        SlipCollabNotificationOutboxRepository repository = mock(SlipCollabNotificationOutboxRepository.class);
        SlipCollabNotificationOutboxService service = new SlipCollabNotificationOutboxService(
                repository,
                mock(UserIdResolver.class), mock(NotificationClient.class));

        UUID slipId = UUID.randomUUID();
        UUID editorId = UUID.randomUUID();
        service.enqueue(UUID.randomUUID(), List.of("recipient"), slipId, editorId, "subject", "body");
        service.enqueue(UUID.randomUUID(), List.of("recipient"), slipId, editorId, "subject", "body");

        org.mockito.Mockito.verify(repository,
                org.mockito.Mockito.times(2)).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void deliveryUsesStablePerRecipientIdempotencyKeyAndEventPayloadKey() {
        SlipCollabNotificationOutboxRepository repository = mock(SlipCollabNotificationOutboxRepository.class);
        UserIdResolver resolver = mock(UserIdResolver.class);
        NotificationClient client = mock(NotificationClient.class);
        UUID eventId = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        UUID slipId = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        UUID editorId = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
        UUID recipientId = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
        SlipCollabNotificationOutbox row = SlipCollabNotificationOutbox.create(
                eventId, slipId, editorId, "recipient", "subject", "body");
        when(resolver.resolve("recipient")).thenReturn(Optional.of(recipientId));
        when(client.sendUserPushWithResult(org.mockito.ArgumentMatchers.eq(recipientId),
                org.mockito.ArgumentMatchers.eq("subject"), org.mockito.ArgumentMatchers.eq("body"),
                org.mockito.ArgumentMatchers.any())).thenReturn(true);
        when(repository.findById(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(row));

        SlipCollabNotificationOutboxService service = new SlipCollabNotificationOutboxService(
                repository, resolver, client);
        service.deliver(row);

        UUID expectedKey = UUID.nameUUIDFromBytes(("slip-collab:" + eventId + ":" + recipientId)
                .getBytes(StandardCharsets.UTF_8));
        org.mockito.Mockito.verify(client).sendUserPushWithResult(recipientId, "subject", "body", expectedKey);
    }

    @Test
    void unresolvedRecipient_isTerminalAndVisibleInsteadOfRetryingForever() {
        SlipCollabNotificationOutboxRepository repository = mock(SlipCollabNotificationOutboxRepository.class);
        UserIdResolver resolver = mock(UserIdResolver.class);
        when(resolver.resolve("system")).thenReturn(Optional.empty());
        SlipCollabNotificationOutbox row = SlipCollabNotificationOutbox.create(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "system", "subject", "body");
        when(repository.findById(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(row));
        SlipCollabNotificationOutboxService service = new SlipCollabNotificationOutboxService(
                repository, resolver, mock(NotificationClient.class));

        service.deliver(row);

        assertThat(readField(row, "status").toString()).isEqualTo("TERMINAL");
        assertThat(readField(row, "terminalReason")).isEqualTo("RECIPIENT_UNRESOLVED");
        org.mockito.Mockito.verify(repository).save(row);
    }

    @Test
    void transientNotificationFailure_remainsRetryableBeforeTerminalLimit() {
        SlipCollabNotificationOutboxRepository repository = mock(SlipCollabNotificationOutboxRepository.class);
        UserIdResolver resolver = mock(UserIdResolver.class);
        NotificationClient client = mock(NotificationClient.class);
        UUID recipientId = UUID.randomUUID();
        when(resolver.resolve("recipient")).thenReturn(Optional.of(recipientId));
        when(client.sendUserPushWithResult(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any())).thenReturn(false);
        SlipCollabNotificationOutbox row = SlipCollabNotificationOutbox.create(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "recipient", "subject", "body");
        when(repository.findById(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(row));
        SlipCollabNotificationOutboxService service = new SlipCollabNotificationOutboxService(
                repository, resolver, client);

        service.deliver(row);

        assertThat(readField(row, "status").toString()).isEqualTo("PENDING");
    }

    private static Object readField(Object target, String name) {
        try {
            java.lang.reflect.Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            return field.get(target);
        } catch (ReflectiveOperationException ex) {
            throw new AssertionError(ex);
        }
    }
}
