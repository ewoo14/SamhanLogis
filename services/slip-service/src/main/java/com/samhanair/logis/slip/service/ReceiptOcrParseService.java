package com.samhanair.logis.slip.service;
import com.samhanair.logis.slip.client.ReceiptOcrClient;
import com.samhanair.logis.slip.client.ReceiptOcrResult;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.ReceiptParseResponse;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * 영수증 이미지 OCR 파싱 + 매입 전표 자동 생성 서비스 (SP-09-3).
 *
 * <p>책임:
 * <ol>
 *   <li>{@link ReceiptOcrClient#submit} 를 통해 OCR 파싱 수행</li>
 *   <li>파싱 결과를 기반으로 INBOUND DRAFT 전표 자동 생성
 *       ({@link Slip#createInbound} 도메인 메서드 활용)</li>
 *   <li>audit log 기록 ({@code REQUIRES_NEW} 패턴 — 메인 트랜잭션 롤백 시에도 audit 보존)</li>
 * </ol>
 *
 * <p><b>UUID 비공개 가드</b>: 응답 {@link ReceiptParseResponse} 에는 slipNo (비즈니스 식별자) 만 노출.
 *
 * <p><b>도메인 메서드 원칙</b>: Slip 생성은 반드시 {@link Slip#createInbound} 를 통해 수행.
 * 직접 setter / reflection 호출 금지.
 *
 * <p><b>SP-09-1 TaxInvoiceEmitAuditRecorder 패턴 일관</b>: audit 기록은 REQUIRES_NEW
 * 별도 트랜잭션으로 분리하여 메인 트랜잭션 롤백과 무관하게 보존.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReceiptOcrParseService {

    private final ReceiptOcrClient receiptOcrClient;
    private final SlipRepository slipRepository;
    private final SlipNumberService slipNumberService;
    private final ReceiptOcrAuditRecorder auditRecorder;

    /**
     * 영수증 이미지를 OCR 로 파싱하고 매입 전표 DRAFT 를 자동 생성한다.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>파일 바이트 추출</li>
     *   <li>{@link ReceiptOcrClient#submit} 호출 (DRY_RUN / CLOVA 분기)</li>
     *   <li>{@link SlipNumberService#next(LocalDate, SlipType)} 로 전표번호 채번</li>
     *   <li>{@link Slip#createInbound} 도메인 메서드로 DRAFT 전표 생성</li>
     *   <li>slip 저장 + audit log 기록 (REQUIRES_NEW)</li>
     * </ol>
     *
     * @param file         업로드된 영수증 이미지 (MultipartFile, 빈 파일 / 10MB 초과 / 비지원 포맷은 호출 전 Controller 에서 거부)
     * @param submitMethod OCR 전송 방식 ("DRY_RUN" | "CLOVA"). null/blank 이면 서버 property fallback.
     * @param actorId      요청자 UUID (전표 requester 및 audit actor)
     * @return OCR 파싱 결과 + 자동 생성된 전표 정보
     * @throws com.samhanair.logis.common.exception.BusinessException(OCR_SUBMIT_FAILED)
     *         CLOVA placeholder 차단 또는 API 오류 시
     */
    @Transactional
    public ReceiptParseResponse parseAndDraft(MultipartFile file,
                                              String submitMethod,
                                              UUID actorId) {
        byte[] imageBytes = extractBytes(file);
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "receipt";

        // effectiveMethod: 파라미터 우선, null/blank 이면 DRY_RUN (client 와 동일 fallback 논리 반영)
        String effectiveMethod = (submitMethod != null && !submitMethod.isBlank()) ? submitMethod : "DRY_RUN";

        // OCR 호출 (DRY_RUN / CLOVA 분기)
        ReceiptOcrResult ocrResult = receiptOcrClient.submit(imageBytes, filename, effectiveMethod);

        // 전표번호 채번 (입고전표 기준)
        LocalDate slipDate = ocrResult.issuedAt() != null ? ocrResult.issuedAt() : LocalDate.now();
        String slipNo = slipNumberService.next(slipDate, SlipType.INBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);

        // Slip 도메인 메서드로 DRAFT 전표 생성 — 직접 setter 금지
        // destinationWarehouseId: OCR shell 단계는 창고 미지정 (후속 수정 시 채움) — 임시 null 허용 처리
        // 단, createInbound 는 destinationWarehouseId 필수이므로 OCR DRAFT 전용 nil UUID 사용
        UUID ocrDraftWarehouseId = UUID.fromString("00000000-0000-0000-0000-000000000000");
        String memoFromOcr = buildOcrMemo(ocrResult, submitMethod);

        Slip slip = Slip.createInbound(
                slipNo,
                slipDate,
                seqNo,
                ocrDraftWarehouseId,
                null,                         // partnerId — OCR 파싱만으로는 UUID 미확정
                ocrResult.vendorName(),        // partnerName snapshot
                null,                         // deliveryTag — OCR shell 단계 불필요
                memoFromOcr,
                actorId != null ? actorId.toString() : "ocr-system"
        );

        Slip saved = slipRepository.save(slip);

        // audit log 기록 (REQUIRES_NEW — 메인 트랜잭션 롤백과 무관하게 보존)
        auditRecorder.record(saved.getId(), saved.getSlipNo(),
                effectiveMethod, actorId, ocrResult.rawJson());

        log.info("[SP-09-3] OCR 파싱 완료 + DRAFT 전표 생성 — slipNo={} vendor={} submitMethod={}",
                saved.getSlipNo(), ocrResult.vendorName(), effectiveMethod);

        return new ReceiptParseResponse(
                saved.getSlipNo(),
                ocrResult.vendorName(),
                ocrResult.totalAmount(),
                ocrResult.vatAmount(),
                ocrResult.issuedAt(),
                effectiveMethod,
                ocrResult.rawJson()
        );
    }

    /**
     * OCR 결과를 전표 memo 로 요약 포맷화한다.
     *
     * @param result       OCR 파싱 결과
     * @param submitMethod OCR 전송 방식
     * @return 전표 memo 문자열 (영수증 OCR 자동 생성 표시 포함)
     */
    private String buildOcrMemo(ReceiptOcrResult result, String submitMethod) {
        StringBuilder sb = new StringBuilder("[OCR-DRAFT]");
        if (result.vendorName() != null) {
            sb.append(" 가게명=").append(result.vendorName());
        }
        if (result.totalAmount() != null) {
            sb.append(" 총액=").append(result.totalAmount());
        }
        if (submitMethod != null && !submitMethod.isBlank()) {
            sb.append(" mode=").append(submitMethod);
        }
        return sb.toString();
    }

    /**
     * MultipartFile 에서 바이트 배열을 추출한다.
     *
     * <p>IOException 은 {@link com.samhanair.logis.common.exception.BusinessException}(RECEIPT_FILE_INVALID)
     * 으로 래핑하여 422 반환 — RuntimeException 500 노출 방지.
     *
     * @param file 업로드된 파일
     * @return 이미지 바이트 배열
     * @throws com.samhanair.logis.common.exception.BusinessException(RECEIPT_FILE_INVALID)
     *         파일 읽기 실패 시 422
     */
    private byte[] extractBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (java.io.IOException e) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.RECEIPT_FILE_INVALID,
                    "파일 바이트 추출 실패: " + e.getMessage());
        }
    }
}
