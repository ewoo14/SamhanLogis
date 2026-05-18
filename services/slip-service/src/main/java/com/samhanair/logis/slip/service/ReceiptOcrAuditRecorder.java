package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 영수증 OCR 파싱 audit log 기록 — REQUIRES_NEW 패턴 (SP-09-3).
 *
 * <p>SP-09-1 {@code TaxInvoiceEmitAuditRecorder} 와 동일한 패턴:
 * <ul>
 *   <li>메인 트랜잭션 롤백 시에도 audit log 는 별도 트랜잭션으로 커밋하여 보존</li>
 *   <li>{@link Propagation#REQUIRES_NEW} — 항상 신규 트랜잭션 시작</li>
 *   <li>{@link SlipAuditLog#record} 정적 factory 사용 (도메인 메서드 원칙)</li>
 * </ul>
 *
 * <p><b>UUID 비공개 가드</b>: fieldName/oldValue/newValue 에 UUID 노출 금지.
 * slipNo (비즈니스 식별자) 기준으로 기록.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReceiptOcrAuditRecorder {

    /** audit fieldName — OCR 자동 생성 이벤트 식별자. */
    public static final String FIELD_OCR_DRAFT = "ocr-draft";

    private final SlipAuditLogRepository auditLogRepository;

    /**
     * OCR 파싱 + DRAFT 전표 자동 생성 audit log 를 별도 트랜잭션으로 기록한다.
     *
     * <p>메인 트랜잭션 롤백 여부와 무관하게 audit 보존.
     *
     * @param slipId       생성된 전표 UUID (내부 audit 추적용)
     * @param slipNo       생성된 전표 번호 (비즈니스 식별자, 사용자 노출 가능)
     * @param submitMethod OCR 전송 방식 ("DRY_RUN" | "CLOVA")
     * @param actorId      요청자 UUID (audit 추적용)
     * @param rawJson      OCR 원본 응답 요약 JSON
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID slipId, String slipNo, String submitMethod,
                       UUID actorId, String rawJson) {
        try {
            UUID safeActorId = actorId != null ? actorId : UUID.fromString("00000000-0000-0000-0000-000000000000");
            String newValue = "OCR-DRAFT slipNo=" + slipNo + " mode=" + submitMethod;
            // rawJson 이 너무 길면 truncate (audit TEXT 컬럼 실용 한계 8KB)
            String rawJsonTrunc = rawJson != null && rawJson.length() > 4000
                    ? rawJson.substring(0, 4000) + "...[truncated]"
                    : rawJson;

            SlipAuditLog log1 = SlipAuditLog.record(
                    slipId, 1, safeActorId, "OCR-SYSTEM", null,
                    FIELD_OCR_DRAFT, rawJsonTrunc, newValue);
            auditLogRepository.save(log1);

            log.info("[SP-09-3] OCR audit 기록 완료 — slipNo={} mode={}", slipNo, submitMethod);
        } catch (Exception e) {
            log.error("[SP-09-3] OCR audit 기록 실패 (무시) — slipId={} error={}",
                    slipId, e.getMessage());
        }
    }
}
