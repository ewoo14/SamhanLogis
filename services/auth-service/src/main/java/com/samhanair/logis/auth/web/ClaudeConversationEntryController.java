package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.AccessDeniedException;

/**
 * #901 S1 Claude 대화 정문.
 *
 * <p>대화·모델·도구 기능은 후속 슬라이스에 남겨 두고, 현재는 기존 계정 권한 체계의
 * {@code system.claude:VIEW}만 서버에서 확인한다. 권한 통과 응답도 의도적으로 501이다.
 */
@RestController
@RequestMapping("/auth/claude")
@RequiredArgsConstructor
public class ClaudeConversationEntryController {

    static final String PAGE_CODE = "system.claude";
    private static final String USER_ID_HEADER = "X-User-Id";

    private final AccountPermissionService permissionService;

    /**
     * Claude 대화 진입 권한만 확인하는 S1 껍데기.
     *
     * @param userId gateway가 서명된 인증정보에서 주입한 계정 UUID
     * @return 권한 통과 시 아직 구현되지 않았음을 나타내는 501
     */
    @PostMapping("/conversations")
    public ResponseEntity<ApiResponse<Void>> open(
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId) {
        UUID accountId = parseAccountId(userId);
        if (accountId == null || !permissionService.check(accountId, PAGE_CODE, PermissionAction.VIEW)) {
            throw new AccessDeniedException("Claude 사용 권한이 없습니다.");
        }
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(ApiResponse.ok(null));
    }

    private UUID parseAccountId(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(userId.trim());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
