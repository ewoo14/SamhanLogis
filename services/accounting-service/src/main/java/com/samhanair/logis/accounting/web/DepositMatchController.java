package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.DepositMatchResult;
import com.samhanair.logis.accounting.service.DepositMatchService;
import com.samhanair.logis.accounting.web.dto.DepositFetchRequest;
import com.samhanair.logis.accounting.web.dto.DepositMatchResponse;
import com.samhanair.logis.accounting.web.dto.DepositMatchResultDto;
import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * KFTC 오픈뱅킹 입금 조회 + 자동 매칭 컨트롤러 (SP-09-4).
 *
 * <p>엔드포인트: {@code POST /accounting/deposits/fetch-and-match}
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (SP-09-1 NTS 와 일관, 회계 권한).
 *
 * <p>오류 코드:
 * <ul>
 *   <li>422 {@code DEPOSIT_DATE_RANGE_INVALID} — from &gt; to</li>
 *   <li>422 {@code INVALID_INPUT} — accountFinNo blank</li>
 *   <li>502 {@code KFTC_SUBMIT_FAILED} — KFTC 모드 API 오류 또는 placeholder 키 차단</li>
 *   <li>403 {@code FORBIDDEN} — SALES / WAREHOUSE / DRIVER / DISPATCH 역할</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 * 응답 {@link DepositMatchResultDto} 에 UUID 필드 없음.
 * journalDraftId 는 서비스 내부에서만 사용.
 */
@Slf4j
@RestController
@RequestMapping("/accounting/deposits")
@RequiredArgsConstructor
public class DepositMatchController {

    private final DepositMatchService depositMatchService;

    /**
     * KFTC 입금 거래 조회 + 자동 매칭 실행.
     *
     * <p>요청 본문의 {@code submitMethod} 가 null 이면 서버 {@code kftc.submit-method} property fallback.
     * DRY_RUN 모드: mock 5건 즉시 반환.
     * KFTC 모드: Phase 11 에서 활성화 예정 — 현재 502 반환.
     *
     * @param request     조회 요청 (from / to / accountFinNo / submitMethod)
     * @param userId      인증된 사용자 ID (X-User-Id 헤더)
     * @return 입금 매칭 결과 (totalCount / matchedCount / unmatchedCount / results[])
     */
    @PostMapping("/fetch-and-match")
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MANAGER', 'MASTER')")
    public ResponseEntity<ApiResponse<DepositMatchResponse>> fetchAndMatch(
            @Valid @RequestBody DepositFetchRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {

        UUID actorId = parseActorId(userId);
        log.info("[SP-09-4] fetch-and-match 요청 — actorId={} from={} to={} submitMethod={}",
                actorId, request.from(), request.to(), request.submitMethod());

        List<DepositMatchResult> results = depositMatchService.fetchAndMatch(
                request.from(),
                request.to(),
                request.accountFinNo(),
                request.submitMethod(),
                actorId
        );

        long matchedCount = results.stream()
                .filter(r -> r.status().name().equals("MATCHED"))
                .count();

        List<DepositMatchResultDto> dtos = results.stream()
                .map(r -> new DepositMatchResultDto(
                        r.depositorName(),
                        r.amount(),
                        r.transactionDate(),
                        r.matchedPartnerCode(),
                        r.matchedTaxInvoiceNo(),
                        r.status().name()
                ))
                .toList();

        DepositMatchResponse response = new DepositMatchResponse(
                results.size(),
                (int) matchedCount,
                (int) (results.size() - matchedCount),
                dtos
        );

        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    /**
     * X-User-Id 헤더 → UUID 파싱. 파싱 실패 시 null 반환 (인증 체인이 이미 검증).
     *
     * @param userId 헤더 값
     * @return UUID 또는 null
     */
    private UUID parseActorId(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            // UUID 형식이 아닌 경우 (예: "accountant-1") — null 처리
            return null;
        }
    }
}
