package com.samhanair.logis.dashboard.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppRelease;
import com.samhanair.logis.dashboard.domain.AppReleaseForceLevel;
import com.samhanair.logis.dashboard.service.AppReleaseService;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class AppReleaseControllerTest {

    private final AppReleaseService service = mock(AppReleaseService.class);
    private final AuditPublisher auditPublisher = mock(AuditPublisher.class);
    private final AppReleaseController controller = new AppReleaseController(service, auditPublisher);

    @Test
    void publishAndUnpublishPublishCentralAuditEvents() {
        UUID id = UUID.randomUUID();
        AppRelease release = release(id);
        when(service.publish(id)).thenReturn(release);
        when(service.unpublish(id)).thenReturn(release);

        assertThat(controller.publish(id, "actor-id").isSuccess()).isTrue();
        assertThat(controller.unpublish(id, "actor-id").isSuccess()).isTrue();

        var events = ArgumentCaptor.forClass(AuditEventV2.class);
        verify(auditPublisher, org.mockito.Mockito.times(2)).publishAfterCommit(events.capture());
        assertThat(events.getAllValues()).extracting(AuditEventV2::serviceName)
                .containsOnly("dashboard-service");
        assertThat(events.getAllValues()).extracting(AuditEventV2::resourceType)
                .containsOnly("APP_RELEASE");
        assertThat(events.getAllValues()).extracting(AuditEventV2::resourceId)
                .containsOnly(id.toString());
        assertThat(events.getAllValues()).extracting(AuditEventV2::description)
                .containsExactly("App release publish", "App release unpublish");
    }

    @Test
    void publishRemainsSuccessfulWhenCentralAuditPublishingFails() {
        UUID id = UUID.randomUUID();
        AppRelease release = release(id);
        when(service.publish(id)).thenReturn(release);
        doThrow(new RuntimeException("rabbit down")).when(auditPublisher).publishAfterCommit(any());

        assertThat(controller.publish(id, "actor-id").isSuccess()).isTrue();
        verify(service).publish(id);
    }

    private static AppRelease release(UUID id) {
        AppRelease release = AppRelease.create(
                AppClientType.DESKTOP, "2026/08/14-1", AppReleaseForceLevel.MINOR,
                "release notes", LocalDateTime.of(2026, 8, 14, 9, 0), "2026/08/13-1");
        ReflectionTestUtils.setField(release, "id", id);
        return release;
    }
}
