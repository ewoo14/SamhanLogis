package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.CodefConnectionService;
import com.samhanair.logis.accounting.web.dto.BankAccountListResponse;
import com.samhanair.logis.accounting.web.dto.CardListResponse;
import com.samhanair.logis.accounting.web.dto.LoanListResponse;
import com.samhanair.logis.accounting.web.dto.RegisterInstitutionRequest;
import com.samhanair.logis.accounting.web.dto.RegisteredInstitutionListResponse;
import com.samhanair.logis.accounting.web.dto.RegisteredInstitutionResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** CODEF connectedId 기관 등록·목록 검증 API. */
@RestController
@RequestMapping("/accounting/codef/connection")
@RequiredArgsConstructor
@Validated
@Tag(name = "CODEF 금융연동", description = "CODEF connectedId 기관 등록과 목록 검증")
public class CodefConnectionController {

    private static final String PAGE_CODE = "accounting.bank-matching";

    private final CodefConnectionService service;

    /** CODEF connectedId에 기관을 등록한다. */
    @PostMapping("/institutions")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    @Operation(summary = "CODEF 기관 등록", description = "일회성 자격으로 CODEF connectedId에 금융기관을 등록")
    public ResponseEntity<ApiResponse<RegisteredInstitutionResponse>> registerInstitution(
            @Valid @RequestBody RegisterInstitutionRequest request) {
        RegisteredInstitutionResponse response = RegisteredInstitutionResponse.from(
                service.registerInstitution(request.toCommand()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(response, "CODEF 기관 등록이 완료되었습니다."));
    }

    /** 등록된 CODEF 기관 목록을 조회한다. */
    @GetMapping("/institutions")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "CODEF 등록 기관 목록", description = "connectedId에 등록된 금융기관 메타 목록 조회")
    public ApiResponse<RegisteredInstitutionListResponse> listInstitutions() {
        return ApiResponse.ok(RegisteredInstitutionListResponse.from(service.listRegistered()));
    }

    /** 등록된 CODEF 은행계좌 목록을 검증 조회한다. */
    @GetMapping("/accounts")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "CODEF 은행계좌 검증 조회", description = "저장된 connectedId로 은행계좌 목록 조회")
    public ApiResponse<BankAccountListResponse> listAccounts() {
        return ApiResponse.ok(BankAccountListResponse.from(service.listAccounts()));
    }

    /** 등록된 CODEF 카드 목록을 검증 조회한다. */
    @GetMapping("/cards")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "CODEF 카드 검증 조회", description = "저장된 connectedId로 카드 목록 조회")
    public ApiResponse<CardListResponse> listCards() {
        return ApiResponse.ok(CardListResponse.from(service.listCards()));
    }

    /** 등록된 CODEF 대출 목록을 검증 조회한다. */
    @GetMapping("/loans")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "CODEF 대출 검증 조회", description = "저장된 connectedId로 대출 목록 조회")
    public ApiResponse<LoanListResponse> listLoans() {
        return ApiResponse.ok(LoanListResponse.from(service.listLoans()));
    }
}
