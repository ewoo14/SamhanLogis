package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.domain.MatchStatus;
import com.samhanair.logis.accounting.service.BankTransactionService;
import com.samhanair.logis.accounting.service.UserBankTxnFilterService;
import com.samhanair.logis.accounting.web.dto.BankTransactionFilterLabelsResponse;
import com.samhanair.logis.accounting.web.dto.BankTransactionFilterPreferenceRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionFilterPreferenceResponse;
import com.samhanair.logis.accounting.web.dto.BankTransactionImportMapping;
import com.samhanair.logis.accounting.web.dto.BankTransactionImportResult;
import com.samhanair.logis.accounting.web.dto.BankTransactionMatchPartnerClearRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionMatchPartnerRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 입출금 매칭용 통장 거래 endpoint. */
@RestController
@RequestMapping("/accounting/bank-transactions")
@RequiredArgsConstructor
@Tag(name = "통장 거래", description = "회계 H-1 BankTransaction CSV import/조회")
public class BankTransactionController {

    private static final String PAGE_CODE = "accounting.bank-matching";

    private final BankTransactionService service;
    private final UserBankTxnFilterService filterService;

    /** 범용 컬럼 매핑 CSV import. */
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    @Operation(summary = "통장 CSV import", description = "은행별 CSV 컬럼을 사용자가 매핑해 BankTransaction 으로 적재")
    public ApiResponse<BankTransactionImportResult> importCsv(
            @RequestPart("file") MultipartFile file,
            @RequestParam String bankAccountLabel,
            @RequestParam String dateColumn,
            @RequestParam(required = false) String depositColumn,
            @RequestParam(required = false) String withdrawalColumn,
            @RequestParam(required = false) String balanceColumn,
            @RequestParam String descriptionColumn,
            @RequestParam(required = false) String counterpartyColumn,
            @RequestParam(required = false) String counterpartyAccountColumn,
            @RequestParam(required = false) String externalRefColumn,
            @RequestParam(defaultValue = "true") boolean headerRow) {
        BankTransactionImportMapping mapping = new BankTransactionImportMapping(
                dateColumn,
                depositColumn,
                withdrawalColumn,
                balanceColumn,
                descriptionColumn,
                counterpartyColumn,
                counterpartyAccountColumn,
                externalRefColumn,
                headerRow);
        return ApiResponse.ok(service.importCsv(file, bankAccountLabel, mapping),
                "통장 CSV import 가 완료되었습니다.");
    }

    /** 통장 거래 목록. */
    @GetMapping
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "통장 거래 목록",
            description = "matchStatus 탭, 기간, 계좌/카드 표시명 소스 인식 필터(빈 목록=해당 소스 전체·대출 등은 면제)")
    public ApiResponse<List<BankTransactionResponse>> list(
            @RequestParam(required = false) MatchStatus matchStatus,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) List<String> accountLabels,
            @RequestParam(required = false) List<String> cardLabels) {
        return ApiResponse.ok(service.list(matchStatus, from, to,
                accountLabels == null ? List.of() : accountLabels,
                cardLabels == null ? List.of() : cardLabels));
    }

    /** 사용자별 입출금내역 계좌/카드 필터 설정 조회. */
    @GetMapping("/filter-preferences")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "입출금내역 필터 설정 조회", description = "X-User-Id 기준 계좌/카드 label 선택 복원")
    public ApiResponse<BankTransactionFilterPreferenceResponse> getFilterPreferences(
            @RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok(filterService.get(parseUserId(userId)));
    }

    /** 사용자별 입출금내역 계좌/카드 필터 설정 저장. */
    @PutMapping("/filter-preferences")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "입출금내역 필터 설정 저장", description = "X-User-Id 기준 계좌/카드 label 선택 저장")
    public ApiResponse<BankTransactionFilterPreferenceResponse> updateFilterPreferences(
            @RequestHeader("X-User-Id") String userId,
            @RequestBody BankTransactionFilterPreferenceRequest request) {
        return ApiResponse.ok(filterService.upsert(parseUserId(userId), request), "필터 설정이 저장되었습니다.");
    }

    /** 필터 모달에 표시할 계좌/카드 label 목록. */
    @GetMapping("/filter-labels")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "입출금내역 필터 label 목록", description = "거래 실존 계좌/카드 label 을 soft-delete 제외 후 조회")
    public ApiResponse<BankTransactionFilterLabelsResponse> filterLabels() {
        return ApiResponse.ok(service.filterLabels());
    }

    /** 미반영 통장 거래에 거래처를 수동 지정한다. */
    @PatchMapping("/match-partner")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "통장 거래 거래처 수동지정", description = "4-key 자연키로 거래를 찾아 partnerCode 로 매칭")
    public ApiResponse<BankTransactionResponse> matchPartner(
            @RequestBody BankTransactionMatchPartnerRequest request) {
        return ApiResponse.ok(service.matchPartner(request), "거래처 매칭이 완료되었습니다.");
    }

    /**
     * 미반영 통장 거래의 거래처 수동지정을 해제한다.
     *
     * <p>DELETE 의 본문 사용은 일부 프록시/클라이언트에서 비표준이라 {@code PATCH .../clear} 로 둔다.
     */
    @PatchMapping("/match-partner/clear")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "통장 거래 거래처 수동지정 해제", description = "4-key 자연키로 거래를 찾아 매칭 거래처를 해제")
    public ApiResponse<BankTransactionResponse> clearPartner(
            @RequestBody BankTransactionMatchPartnerClearRequest request) {
        return ApiResponse.ok(service.clearPartner(request), "거래처 매칭이 해제되었습니다.");
    }

    private static UUID parseUserId(String value) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "유효한 사용자 식별자가 필요합니다.", ex);
        }
    }
}
