package com.samhanair.logis.log.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.repository.AuditLogRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

/** DEV-3 활동 로그 조회/수집 계약 검증. */
class ActivityLogServiceTest {

    private final AuditLogRepository repository = org.mockito.Mockito.mock(AuditLogRepository.class);
    private final ActivityLogService service = new ActivityLogService(repository);

    @Test
    @DisplayName("활동 로그 검색은 다중 optional 필터를 repository 조건으로 전달하고 UUID userId를 응답에 노출하지 않는다")
    void searchFiltersAndMasksUserId() {
        AuditLog row = AuditLog.builder()
                .serviceName("desktop")
                .userId("11111111-1111-1111-1111-111111111111")
                .userRole("DEVELOPER")
                .action("MENU_ACCESS")
                .resourceType("MENU")
                .resourceId("dev.activity-log")
                .description("로그 메뉴 진입")
                .occurredAt(Instant.parse("2026-06-28T00:30:00Z"))
                .build();
        when(repository.searchActivity(any(ActivityLogSearchCondition.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(row)));

        ActivityLogSearchCondition condition = new ActivityLogSearchCondition(
                "MENU_ACCESS",
                "MENU",
                "dev.activity-log",
                "11111111-1111-1111-1111-111111111111",
                "로그",
                Instant.parse("2026-06-28T00:00:00Z"),
                Instant.parse("2026-06-28T09:00:00Z"));

        ActivityLogPageResponse response = service.search(condition, 0, 20);

        ArgumentCaptor<ActivityLogSearchCondition> captor =
                ArgumentCaptor.forClass(ActivityLogSearchCondition.class);
        verify(repository).searchActivity(captor.capture(), any(Pageable.class));
        assertThat(captor.getValue()).isEqualTo(condition);
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).user()).isEqualTo("개발자");
        assertThat(response.items().get(0).userRole()).isEqualTo("DEVELOPER");
        assertThat(response.items().get(0).toString()).doesNotContain("11111111-1111-1111-1111-111111111111");
    }

    @Test
    @DisplayName("MENU_ACCESS 프론트 이벤트는 userId 는 헤더 신원, userRole 은 본문 표시값으로 저장한다")
    void collectMenuAccessUsesTrustedHeaderIdentity() {
        // 본문 userId 는 위조 가능하므로 무시하고, userRole 은 gateway 미제공 role 의 표시 힌트로만 사용한다.
        FrontAuditLogRequest request = new FrontAuditLogRequest(
                "MENU_ACCESS",
                "MENU",
                "dev.activity-log",
                "99999999-9999-9999-9999-999999999999",
                "MASTER",
                "로그 메뉴 진입",
                Instant.parse("2026-06-28T00:30:00Z"),
                null,
                null,
                null,
                null);

        service.collectFrontEvent(
                request, "11111111-1111-1111-1111-111111111111", "127.0.0.1", "JUnit");

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(captor.capture());
        AuditLog saved = captor.getValue();
        assertThat(saved.getAction()).isEqualTo("MENU_ACCESS");
        assertThat(saved.getResourceType()).isEqualTo("MENU");
        assertThat(saved.getResourceId()).isEqualTo("dev.activity-log");
        assertThat(saved.getServiceName()).isEqualTo("desktop");
        // userId 는 게이트웨이 헤더(신뢰원)만 — 본문 위조 값은 무시.
        assertThat(saved.getUserId()).isEqualTo("11111111-1111-1111-1111-111111111111");
        assertThat(saved.getUserRole()).isEqualTo("MASTER");
    }
}
