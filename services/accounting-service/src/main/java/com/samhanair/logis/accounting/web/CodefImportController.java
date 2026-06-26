package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.CodefImportService;
import com.samhanair.logis.accounting.web.dto.CodefImportRequest;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** CODEF 은행·카드·대출 거래내역 온디맨드 import endpoint. */
@RestController
@RequestMapping("/accounting/codef")
@RequiredArgsConstructor
@Tag(name = "CODEF 거래내역", description = "CODEF 은행·카드·대출 거래내역 DRY_RUN/실연동 import")
public class CodefImportController {

    private static final String PAGE_CODE = "accounting.bank-matching";

    private final CodefImportService codefImportService;

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
}
