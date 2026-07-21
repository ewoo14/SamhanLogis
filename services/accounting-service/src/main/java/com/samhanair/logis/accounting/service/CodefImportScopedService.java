package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.domain.CodefScopeMode;
import com.samhanair.logis.accounting.util.CodefRefNormalizer;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** BC3 다중 ref/명시적 실행 scope 기반 거래내역 import 서비스. */
@Service
@RequiredArgsConstructor
public class CodefImportScopedService {

    private final CodefClient codefClient;
    private final CodefImportService codefImportService;
    private final UserCodefImportScopeService scopeService;

    /**
     * 실행 scopeMode와 ref 집합을 해석한 뒤 거래내역을 가져온다.
     *
     * <p>해석 규칙(#825 슬5 R1 정정 — spec §0 표 ③ "선택 리스트 {@code []} = 전체" 는 실측 오류였다.
     * 실행 scopeMode가 의미의 권위값이며, ref 필드의 존재 여부만으로 의미를 추론하지 않는다.
     * <ul>
     *     <li>{@code scopeMode=ALL}이고 저장된 scope도 ALL이면 저장된 {@code defaultImportType}의
     *         서버 목록을 열거한다. 저장 scope가 없으면 요청 {@code type}을 사용한다.</li>
     *     <li>{@code scopeMode=SELECTED}이면 요청의 세 ref 배열을 모두 명시하고 하나 이상 선택한다.
     *         이 경로의 {@code type}은 명시 ref 집합의 실행 계약이므로 저장된 기본 유형으로
     *         덮어쓰지 않는다.</li>
     * </ul>
     *
     * <p>#825 슬5 R1 BLOCKING#1 fix — 종전에는 저장된 scope 의 scopeMode 를 보지 않고 ref 가
     * 비어 있으면 무조건 저장된 선택으로 오판해 의미가 뒤집혔다. 실행 요청도 scopeMode를
     * 명시해 직렬화 방식에 관계없이 ALL/SELECTED 의미를 유지한다.
     */
    @Transactional
    public CodefImportResponse importTransactionsWithScope(LocalDate from, LocalDate to,
                                                           CodefImportType type,
                                                           String scopeMode,
                                                           String connectedId,
                                                           List<String> accountRefs,
                                                           List<String> cardRefs,
                                                           List<String> loanRefs,
                                                           String submitMethod,
                                                           UUID userId) {
        if (userId == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증 사용자 정보가 필요합니다.");
        }
        validateConnectedId(connectedId);
        CodefScopeMode effectiveScopeMode = CodefScopeMode.parse(scopeMode);
        CodefImportScopeResponse savedScope = scopeService.get(userId, connectedId.trim());
        CodefImportType effectiveType = resolveEffectiveType(type, effectiveScopeMode, savedScope);
        ResolvedRefs refs = resolveRefs(effectiveType, effectiveScopeMode, connectedId.trim(), accountRefs,
                cardRefs, loanRefs, submitMethod);
        return codefImportService.importTransactionsForRefs(
                from,
                to,
                effectiveType,
                refs.accountRefs(),
                refs.cardRefs(),
                refs.loanRefs(),
                submitMethod);
    }

    /**
     * 저장된 ALL scope의 기본 유형을 실행 범위의 권위값으로 적용한다.
     *
     * <p>저장된 SELECTED scope는 요청에 명시된 ref 집합이 실행 계약이므로 요청 type을 유지한다.
     * 반면 ALL scope는 ref가 없어서 type만이 열거 범위를 결정하므로, 요청 type을 그대로 신뢰하면
     * 저장된 CARD/BANK/LOAN 범위를 전체 범위로 확대할 수 있다.
     */
    private static CodefImportType resolveEffectiveType(CodefImportType requestedType,
                                                         CodefScopeMode requestedScopeMode,
                                                         CodefImportScopeResponse savedScope) {
        CodefImportType fallback = requestedType != null ? requestedType : CodefImportType.ALL;
        if (requestedScopeMode == CodefScopeMode.ALL
                && savedScope != null
                && "ALL".equals(savedScope.scopeMode())
                && savedScope.defaultImportType() != null) {
            return savedScope.defaultImportType();
        }
        return fallback;
    }

    private ResolvedRefs resolveRefs(CodefImportType type, CodefScopeMode scopeMode, String connectedId,
                                     List<String> accountRefs, List<String> cardRefs, List<String> loanRefs,
                                     String submitMethod) {
        if (scopeMode == CodefScopeMode.ALL) {
            if (accountRefs != null || cardRefs != null || loanRefs != null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "scopeMode=ALL 실행에는 ref 목록을 보낼 수 없습니다.");
            }
            return listAllFromCodef(type, connectedId, submitMethod);
        }

        boolean allRefsPresent = accountRefs != null && cardRefs != null && loanRefs != null;
        boolean hasSelection = allRefsPresent
                && (accountRefs.stream().anyMatch(ref -> ref != null && !ref.isBlank())
                || cardRefs.stream().anyMatch(ref -> ref != null && !ref.isBlank())
                || loanRefs.stream().anyMatch(ref -> ref != null && !ref.isBlank()));
        if (!hasSelection) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "scopeMode=SELECTED 실행에는 비어 있지 않은 ref 목록을 명시해야 합니다.");
        }
        return new ResolvedRefs(
                CodefRefNormalizer.normalizeRefs(accountRefs),
                CodefRefNormalizer.normalizeRefs(cardRefs),
                CodefRefNormalizer.normalizeRefs(loanRefs));
    }

    /** CODEF 서버 목록 전체를 열거해 진짜 '전체' 를 materialize한다(진짜 ALL — null 필드 부재 의미). */
    private ResolvedRefs listAllFromCodef(CodefImportType type, String connectedId, String submitMethod) {
        return new ResolvedRefs(
                shouldImport(type, CodefImportType.BANK)
                        ? codefClient.listBankAccounts(connectedId, submitMethod).stream()
                                .map(account -> account.ref())
                                .toList()
                        : List.of(),
                shouldImport(type, CodefImportType.CARD)
                        ? codefClient.listCards(connectedId, submitMethod).stream()
                                .map(card -> card.ref())
                                .toList()
                        : List.of(),
                shouldImport(type, CodefImportType.LOAN)
                        ? codefClient.listLoans(connectedId, submitMethod).stream()
                                .map(loan -> loan.ref())
                                .toList()
                        : List.of());
    }

    private static boolean shouldImport(CodefImportType requestedType, CodefImportType candidateType) {
        return requestedType == CodefImportType.ALL || requestedType == candidateType;
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "연결 식별자는 필수입니다.");
        }
    }

    private record ResolvedRefs(List<String> accountRefs, List<String> cardRefs, List<String> loanRefs) {
    }
}
