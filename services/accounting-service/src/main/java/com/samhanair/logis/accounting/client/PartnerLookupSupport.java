package com.samhanair.logis.accounting.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;

/**
 * accounting 서비스의 거래처 조회 상태 처리 공통 helper.
 *
 * <p>실제 {@link PartnerLookupClient}는 항상 3분류 결과를 반환한다. 결과가 null인 경우는
 * 기존 {@code @MockBean} 테스트가 새 메서드를 아직 stub하지 않은 경우에만 해당하므로,
 * 기존 Optional/List API를 한 번만 호환 호출해 테스트 계약을 깨지 않도록 한다.
 */
public final class PartnerLookupSupport {

    private PartnerLookupSupport() {
    }

    /** partnerCode 조회 결과를 3분류로 정규화한다. */
    public static PartnerLookupClient.LookupResult byCode(PartnerLookupClient client, String partnerCode) {
        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult(partnerCode);
        if (result != null) {
            return result;
        }
        return client.findByPartnerCode(partnerCode)
                .map(PartnerLookupClient.LookupResult::found)
                .orElseGet(PartnerLookupClient.LookupResult::notFound);
    }

    /** partnerName 조회 결과를 3분류로 정규화한다. */
    public static PartnerLookupClient.LookupResult byName(PartnerLookupClient client, String partnerName) {
        PartnerLookupClient.LookupResult result = client.findByPartnerNameResult(partnerName);
        if (result != null) {
            return result;
        }
        return client.findByPartnerName(partnerName)
                .map(PartnerLookupClient.LookupResult::found)
                .orElseGet(PartnerLookupClient.LookupResult::notFound);
    }

    /** directory 조회 결과를 3분류로 정규화한다. */
    public static PartnerLookupClient.DirectoryLookupResult directory(
            PartnerLookupClient client, String query, int limit) {
        PartnerLookupClient.DirectoryLookupResult result = client.searchDirectoryResult(query, limit);
        if (result != null) {
            return result;
        }
        List<PartnerSummary> partners = client.searchDirectory(query, limit);
        return partners.isEmpty()
                ? PartnerLookupClient.DirectoryLookupResult.notFound()
                : PartnerLookupClient.DirectoryLookupResult.found(partners);
    }

    /** FOUND가 아니면 A군의 fail-closed 오류를 던진다. */
    public static PartnerSummary requireFound(PartnerLookupClient.LookupResult result,
                                               String notFoundMessage) {
        return requireFound(result, ErrorCode.UNPROCESSABLE_ENTITY, notFoundMessage);
    }

    /** FOUND가 아니면 호출부가 원래 유지하던 NOT_FOUND/422 코드를 사용해 fail-closed 한다. */
    public static PartnerSummary requireFound(PartnerLookupClient.LookupResult result,
                                               ErrorCode notFoundCode,
                                               String notFoundMessage) {
        throwIfUnavailable(result == null ? null : result.status());
        if (result == null || !result.isFound()) {
            throw new BusinessException(notFoundCode, notFoundMessage);
        }
        return result.partner();
    }

    /** NOT_FOUND는 empty를 유지하고 UNAVAILABLE만 명시적 오류로 올린다. */
    public static PartnerSummary foundOrNull(PartnerLookupClient.LookupResult result) {
        throwIfUnavailable(result == null ? null : result.status());
        return result != null && result.isFound() ? result.partner() : null;
    }

    /** directory 결과에서 UNAVAILABLE을 명시적 오류로 올리고 목록을 반환한다. */
    public static List<PartnerSummary> availableDirectory(
            PartnerLookupClient.DirectoryLookupResult result) {
        if (result == null || result.isUnavailable()) {
            throw unavailable();
        }
        return result.partners();
    }

    /** partner-service 장애를 입력 오류/미존재와 구별되는 502로 표면화한다. */
    public static BusinessException unavailable() {
        return new BusinessException(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE,
                "거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }

    private static void throwIfUnavailable(PartnerLookupClient.LookupStatus status) {
        if (status == PartnerLookupClient.LookupStatus.UNAVAILABLE) {
            throw unavailable();
        }
    }
}
