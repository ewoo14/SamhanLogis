package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class NotificationDispatchPersistenceTest {

    @Test
    void blankIdempotencyKeyIsPersistedAsNullForLegacyPush() {
        NotificationRequestRepository repository = mock(NotificationRequestRepository.class);
        when(repository.save(any(NotificationRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));
        NotificationDispatchPersistence persistence = new NotificationDispatchPersistence(repository);

        NotificationRequest saved = persistence.prepare(new NotificationSendRequest(
                RecipientType.USER, UUID.randomUUID(), null, NotificationChannel.PUSH,
                null, "안내", "본문", null, "  "));

        assertThat(saved.getIdempotencyKey()).isNull();
    }
}
