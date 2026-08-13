package com.samhanair.logis.log.web;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.repository.AuditLogRepository;
import com.samhanair.logis.shared.audit.publisher.AuditSanitizer;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

/** DEV-3 활동 로그 조회와 프론트 이벤트 수집 서비스. */
@Service
@RequiredArgsConstructor
public class ActivityLogService {

    private static final int MAX_PAGE_SIZE = 100;

    private final AuditLogRepository repository;

    /** 검색 조건을 적용하고 화면 응답에서는 사용자 UUID를 제거한다. */
    public ActivityLogPageResponse search(ActivityLogSearchCondition condition, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Page<AuditLog> result = repository.searchActivity(
                condition,
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "occurredAt")));
        return new ActivityLogPageResponse(
                result.getContent().stream().map(ActivityLogService::toResponse).toList(),
                result.getTotalElements(),
                result.getTotalPages(),
                result.getNumber(),
                result.getSize());
    }

    /**
     * 기존 프론트 감사 이벤트 계약을 AuditLog 문서로 저장한다.
     *
     * <p>감사 신원 userId 는 <b>게이트웨이가 재주입한 신뢰 헤더(X-User-Id)</b>만 사용한다.
     * gateway 는 legacy 인가 폴백 방지를 위해 X-User-Role 을 제거하므로,
     * 본문의 userRole/manager 는 감사 화면 표시용 힌트로만 저장한다.
     */
    public void collectFrontEvent(
            FrontAuditLogRequest request, String actorId, String ipAddress, String userAgent) {
        String action = defaultString(request.action(), "MENU_ACCESS");
        String resourceType = defaultString(request.resourceType(), "MENU");
        String resourceId = defaultString(request.resourceId(), request.group());
        String description = defaultString(request.description(), request.message());
        String displayRole = defaultString(request.userRole(), request.manager());
        AuditLog entry = AuditLog.builder()
                .id(UUID.randomUUID().toString())
                .serviceName("desktop")
                .userId(blankToNull(actorId))
                .userRole(displayRole)
                .action(action)
                .resourceType(resourceType)
                .resourceId(resourceId)
                .description(description)
                .afterData(request.afterData())
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .occurredAt(request.occurredAt() != null ? request.occurredAt() : Instant.now())
                .ingestedAt(Instant.now())
                .build();
        repository.save(entry);
    }

    private static ActivityLogResponse toResponse(AuditLog row) {
        return new ActivityLogResponse(
                row.getOccurredAt(),
                roleLabel(row.getUserRole()),
                blankToDash(row.getUserRole()),
                blankToDash(row.getAction()),
                blankToDash(row.getResourceType()),
                AuditSanitizer.display(row.getResourceId()),
                AuditSanitizer.display(row.getDescription()),
                blankToDash(row.getServiceName()));
    }

    private static String roleLabel(String role) {
        String normalized = blankToDash(role).toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "MASTER" -> "마스터";
            case "MANAGER" -> "관리자";
            case "DEVELOPER" -> "개발자";
            case "SALES" -> "영업";
            case "ACCOUNTANT" -> "회계";
            case "WAREHOUSE" -> "창고";
            case "DISPATCH" -> "배차";
            case "DRIVER" -> "기사";
            case "STAFF" -> "직원";
            default -> "사용자";
        };
    }

    private static String defaultString(String value, String fallback) {
        String normalized = blankToNull(value);
        if (normalized != null) {
            return normalized;
        }
        String normalizedFallback = blankToNull(fallback);
        return normalizedFallback != null ? normalizedFallback : "-";
    }

    private static String blankToDash(String value) {
        return value == null || value.isBlank() ? "-" : value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
