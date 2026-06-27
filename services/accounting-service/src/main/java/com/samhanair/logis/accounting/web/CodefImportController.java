package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.service.CodefImportScopedService;
import com.samhanair.logis.accounting.service.CodefImportService;
import com.samhanair.logis.accounting.service.UserCodefImportScopeService;
import com.samhanair.logis.accounting.web.dto.BankAccountListResponse;
import com.samhanair.logis.accounting.web.dto.CardListResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportRequest;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeRequest;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportScopedRequest;
import com.samhanair.logis.accounting.web.dto.LoanListResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** CODEF 은행·카드·대출 거래내역 온디맨드 import endpoint. */
@RestController
@RequestMapping("/accounting/codef")
@RequiredArgsConstructor
@Tag(name = "CODEF 거래내역", description = "CODEF 은행·카드·대출 거래내역 DRY_RUN/실연동 import")
public class CodefImportController {

    private static final String PAGE_CODE = "accounting.bank-matching";

    private final CodefImportService codefImportService;
    private final CodefImportScopedService codefImportScopedService;
    private final UserCodefImportScopeService scopeService;
    private final CodefClient codefClient;

    /** 연결 자격에 등록된 은행계좌 목록을 조회한다. */
    @GetMapping("/bank-accounts")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "은행계좌 목록", description = "연결 식별자 기준 은행계좌 ref 목록 조회")
    public ApiResponse<BankAccountListResponse> listBankAccounts(
            @RequestParam String connectedId,
            @RequestParam(required = false) String submitMethod) {
        return ApiResponse.ok(BankAccountListResponse.from(
                codefClient.listBankAccounts(connectedId, submitMethod)));
    }

    /** 연결 자격에 등록된 카드 목록을 조회한다. */
    @GetMapping("/cards")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "카드 목록", description = "연결 식별자 기준 카드 ref 목록 조회")
    public ApiResponse<CardListResponse> listCards(
            @RequestParam String connectedId,
            @RequestParam(required = false) String submitMethod) {
        return ApiResponse.ok(CardListResponse.from(
                codefClient.listCards(connectedId, submitMethod)));
    }

    /** 연결 자격에 등록된 대출 목록을 조회한다. */
    @GetMapping("/loans")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "대출 목록", description = "연결 식별자 기준 대출 ref 목록 조회")
    public ApiResponse<LoanListResponse> listLoans(
            @RequestParam String connectedId,
            @RequestParam(required = false) String submitMethod) {
        return ApiResponse.ok(LoanListResponse.from(
                codefClient.listLoans(connectedId, submitMethod)));
    }

    /** CODEF 은행·카드·대출 거래내역을 조회해 BankTransaction 으로 적재한다. */
    @PostMapping("/import")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    @Operation(summary = "CODEF 거래내역 import", description = "계좌/카드/대출 ref 기준 온디맨드 조회 후 BankTransaction 적재")
    public ApiResponse<CodefImportResponse> importCodef(
            @Valid @RequestBody CodefImportRequest request) {
        return ApiResponse.ok(codefImportService.importTransactions(
                        request.from(),
                        request.to(),
                        request.type(),
                        request.accountRef(),
                        request.cardRef(),
                        request.loanRef(),
                        request.submitMethod()),
                "CODEF 거래내역 import 가 완료되었습니다.");
    }

    /** 다중 ref 또는 저장 선택 기준으로 거래내역을 조회해 BankTransaction 으로 적재한다. */
    @PostMapping("/import-scoped")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    @Operation(summary = "거래내역 scoped import", description = "다중 ref, 전체 목록, 저장 선택 기준 거래내역 import")
    public ApiResponse<CodefImportResponse> importScoped(
            @Valid @RequestBody CodefImportScopedRequest request,
            @RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok(codefImportScopedService.importTransactionsWithScope(
                        request.from(),
                        request.to(),
                        request.type(),
                        request.connectedId(),
                        request.accountRefs(),
                        request.cardRefs(),
                        request.loanRefs(),
                        request.submitMethod(),
                        parseUserId(userId)),
                "거래내역 import 가 완료되었습니다.");
    }

    /** 인증 사용자별 가져오기 선택 scope 를 저장한다. */
    @PutMapping("/scopes")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "가져오기 선택 저장", description = "인증 사용자와 연결 식별자 기준 선택 ref 저장")
    public ApiResponse<CodefImportScopeResponse> upsertScope(
            @Valid @RequestBody CodefImportScopeRequest request,
            @RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok(scopeService.upsert(parseUserId(userId), request),
                "가져오기 선택이 저장되었습니다.");
    }

    /** 인증 사용자별 가져오기 선택 scope 를 조회한다. */
    @GetMapping("/scopes")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "가져오기 선택 조회", description = "인증 사용자와 연결 식별자 기준 선택 ref 조회")
    public ApiResponse<CodefImportScopeResponse> getScope(
            @RequestParam String connectedId,
            @RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok(scopeService.get(parseUserId(userId), connectedId));
    }

    private UUID parseUserId(String userId) {
        try {
            return UUID.fromString(userId);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "X-User-Id 는 UUID 형식이어야 합니다.", ex);
        }
    }
}
