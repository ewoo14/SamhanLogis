package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.claude.ClaudeConversationService;
import com.samhanair.logis.auth.web.dto.ClaudeConversationRequest;
import com.samhanair.logis.auth.web.dto.ClaudeConversationResponse;
import com.samhanair.logis.auth.web.dto.ClaudeSessionResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.security.access.AccessDeniedException;
import com.samhanair.logis.common.security.JwtTokenProvider;

/**
 * #901 S1 Claude 대화 정문.
 *
 * <p>대화·모델·도구 기능은 후속 슬라이스에 남겨 두고, 현재는 기존 계정 권한 체계의
 * {@code system.claude:VIEW}를 먼저 서버에서 확인한 뒤 대화 처리 경계로 진입시킨다.
 */
@RestController
@RequestMapping("/auth/claude")
@RequiredArgsConstructor
public class ClaudeConversationEntryController {

    static final String PAGE_CODE = "system.claude";
    private static final String USER_ID_HEADER = "X-User-Id";

    private final AccountPermissionService permissionService;
    private final ClaudeConversationService conversationService;
    private final JwtIssueProperties jwtProperties;

    /**
     * Claude 대화 진입 권한만 확인하는 S1 껍데기.
     *
     * @param userId gateway가 서명된 인증정보에서 주입한 계정 UUID
     * @return 권한 통과 시 모델 응답 또는 자격 미설정 오류
     */
    @PostMapping("/conversations")
    public ResponseEntity<ApiResponse<ClaudeConversationResponse>> open(
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @CookieValue(value = "access_token", required = false) String accessToken,
            @Valid @RequestBody(required = false) ClaudeConversationRequest request) {
        UUID accountId = requireTokenAccount(userId, authorization, accessToken);
        if (!permissionService.check(accountId, PAGE_CODE, PermissionAction.VIEW)) {
            conversationService.recordDenied(accountId, null, "CLAUDE_PERMISSION");
            throw new AccessDeniedException("Claude 사용 권한이 없습니다.");
        }
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "질문 본문이 필요합니다.");
        }
        String answer = conversationService.ask(accountId, request.sessionCode(), request.question());
        return ResponseEntity.ok(ApiResponse.ok(new ClaudeConversationResponse(answer, answer.startsWith("[가상 에이전트]"))));
    }

    @PostMapping("/sessions")
    public ResponseEntity<ApiResponse<ClaudeSessionResponse>> createSession(
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @CookieValue(value = "access_token", required = false) String accessToken) {
        UUID accountId = requireClaudeAccess(userId, authorization, accessToken);
        var session = conversationService.createSession(accountId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(
                new ClaudeSessionResponse(session.getSessionCode(), session.getTitle(), 0,
                        session.getLastMessage(), session.getLastMessageAt(), session.getSummaryMode())));
    }

    @org.springframework.web.bind.annotation.GetMapping("/sessions")
    public ResponseEntity<ApiResponse<java.util.List<ClaudeSessionResponse>>> listSessions(
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @CookieValue(value = "access_token", required = false) String accessToken) {
        return ResponseEntity.ok(ApiResponse.ok(conversationService.listSessions(requireClaudeAccess(userId, authorization, accessToken))));
    }

    @PostMapping("/sessions/{sessionCode}/messages")
    public ResponseEntity<ApiResponse<ClaudeConversationResponse>> askInSession(
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @CookieValue(value = "access_token", required = false) String accessToken,
            @org.springframework.web.bind.annotation.PathVariable String sessionCode,
            @Valid @RequestBody ClaudeConversationRequest request) {
        UUID accountId = requireClaudeAccess(userId, authorization, accessToken);
        String answer = conversationService.ask(accountId, sessionCode, request.question());
        return ResponseEntity.ok(ApiResponse.ok(new ClaudeConversationResponse(
                answer, answer.startsWith("[가상 에이전트]"))));
    }

    private UUID requireClaudeAccess(String userId, String authorization, String accessToken) {
        UUID accountId = requireTokenAccount(userId, authorization, accessToken);
        if (accountId == null || !permissionService.check(accountId, PAGE_CODE, PermissionAction.VIEW)) {
            conversationService.recordDenied(accountId, null, "CLAUDE_PERMISSION");
            throw new AccessDeniedException("Claude 사용 권한이 없습니다.");
        }
        return accountId;
    }

    /** auth-service 직호출에서도 gateway가 검증한 것과 같은 서명·만료·서비스 토큰 계약을 강제한다. */
    private UUID requireTokenAccount(String userId, String authorization, String accessToken) {
        UUID headerAccount = parseAccountId(userId);
        String rawToken = authorization != null && authorization.startsWith("Bearer ")
                ? authorization.substring("Bearer ".length()).trim() : accessToken;
        if (rawToken == null || rawToken.isBlank()) {
            conversationService.recordDenied(headerAccount, null, "MISSING_TOKEN");
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증 토큰이 필요합니다.");
        }
        try {
            var token = JwtTokenProvider.parse(rawToken, jwtProperties.getSecretBytes());
            if (JwtTokenProvider.getPartnerCode(token) != null) {
                throw new IllegalArgumentException("partner token is not a Samhan user token");
            }
            UUID tokenAccount = UUID.fromString(JwtTokenProvider.getUserId(token));
            if (headerAccount == null || !headerAccount.equals(tokenAccount)) {
                conversationService.recordDenied(tokenAccount, null, "IDENTITY_MISMATCH");
                throw new AccessDeniedException("인증 주체가 일치하지 않습니다.");
            }
            return tokenAccount;
        } catch (AccessDeniedException ex) {
            throw ex;
        } catch (Exception ex) {
            conversationService.recordDenied(headerAccount, null, "INVALID_TOKEN");
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "유효하지 않은 인증 토큰입니다.");
        }
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
