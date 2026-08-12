package com.samhanair.logis.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.repository.AppReleaseRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AppReleaseServiceNoPublishedReleaseTest {

    @Mock
    private AppReleaseRepository repository;

    @InjectMocks
    private AppReleaseService service;

    @Test
    void checkVersion_withoutPublishedRelease_returnsNoUpdateInsteadOfNotFound() {
        when(repository.findByClientTypeAndPublishedTrue(AppClientType.DESKTOP)).thenReturn(List.of());

        var response = service.checkVersion(AppClientType.DESKTOP, "2026/08/13-1092");

        assertThat(response.forceLevel()).isEqualTo(com.samhanair.logis.dashboard.domain.AppVersionForceLevel.NONE);
        assertThat(response.latestVersion()).isEqualTo("2026/08/13-1092");
        assertThat(response.minSupportedVersion()).isEqualTo("2026/08/13-1092");
    }
}
