package com.samhanair.logis.partnerorder.vendor.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient.CatalogEntry;
import com.samhanair.logis.partnerorder.vendor.ocr.OcrEngine;
import com.samhanair.logis.partnerorder.vendor.ocr.OcrException;
import com.samhanair.logis.partnerorder.vendor.parser.ParsedVendorOrder;
import com.samhanair.logis.partnerorder.vendor.parser.VendorOrderParser;
import com.samhanair.logis.partnerorder.vendor.parser.VendorParserRegistry;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmRequest;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmResponse;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderUploadResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

/**
 * vendor 발주서 처리 서비스 — OCR → parser → 단가 lookup → DC 적용 → preview / confirm.
 *
 * <p>OCR endpoint 활성화 가드: {@link OcrEngine} bean 이 등록된 경우에만 동작
 * ({@link com.samhanair.logis.partnerorder.vendor.ocr.OcrEngineConfig} 의
 * {@code samhan.partner-order.ocr.enabled=true}). 미등록 시 {@link #ensureOcrEnabled()} 가
 * BusinessException(SERVICE_UNAVAILABLE 의미) 던짐 — controller 가 503 으로 변환.
 *
 * <p>UUID 비공개 가드 — 본 service 는 partnerCode / vendorName / modelCode / orderNo 만 외부 노출.
 */
@Service
public class VendorOrderService {

    private static final Logger log = LoggerFactory.getLogger(VendorOrderService.class);
    private static final DateTimeFormatter ORDER_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    private static final int OCR_TEXT_MAX_PREVIEW = 2000;
    private static LocalDate inMemoryOrderDate = LocalDate.MIN;
    private static int inMemoryOrderSeq = 0;

    /** ObjectProvider — OcrEngine bean 미등록 시에도 service 자체는 부팅 가능. */
    private final ObjectProvider<OcrEngine> ocrEngineProvider;
    private final VendorParserRegistry parserRegistry;
    private final ProductCatalogLookupClient catalogClient;
    private final PartnerLookupClient partnerLookupClient;
    private final DcConfigClient dcConfigClient;

    public VendorOrderService(ObjectProvider<OcrEngine> ocrEngineProvider,
                              VendorParserRegistry parserRegistry,
                              ProductCatalogLookupClient catalogClient,
                              PartnerLookupClient partnerLookupClient,
                              DcConfigClient dcConfigClient) {
        this.ocrEngineProvider = ocrEngineProvider;
        this.parserRegistry = parserRegistry;
        this.catalogClient = catalogClient;
        this.partnerLookupClient = partnerLookupClient;
        this.dcConfigClient = dcConfigClient;
    }

    /**
     * upload 흐름: OCR → parser 식별 → 시트 단가 lookup → DC 적용 → preview 응답.
     *
     * @param fileBytes 업로드 파일 바이트
     * @param mimeType MIME
     * @param vendorHint 사용자 명시 vendor (null 가능 — auto-detect 시도)
     * @param partnerCodeHint 사용자 명시 partnerCode (null 가능 — parser 인식 시도)
     */
    public VendorOrderUploadResponse upload(byte[] fileBytes, String mimeType,
                                            String vendorHint, String partnerCodeHint) {
        if (fileBytes == null || fileBytes.length == 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "업로드 파일 비어있음");
        }
        OcrEngine engine = ensureOcrEnabled();
        String ocrText;
        try {
            ocrText = engine.extractText(fileBytes, mimeType);
        } catch (OcrException ex) {
            log.error("vendor OCR 실패: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "OCR 엔진 오류 — DevOps Tesseract setup 확인", ex);
        }

        // parser 매칭
        VendorOrderParser parser = resolveParser(vendorHint, ocrText);
        ParsedVendorOrder parsed = parser.parse(ocrText);
        String partnerCode = firstNonBlank(partnerCodeHint, parsed.partnerCode());

        // 단가 lookup (시트 1회 read)
        List<String> modelCodes = parsed.lines().stream()
                .map(ParsedVendorOrder.Line::modelCode)
                .distinct()
                .toList();
        Map<String, CatalogEntry> catalog = catalogClient.findByModelCodes(modelCodes);

        // DC 조회 (partnerCode 가 있을 때만)
        BigDecimal dcRate = BigDecimal.ZERO;
        if (partnerCode != null && !partnerCode.isBlank()) {
            try {
                Map<String, Object> dcConfig = dcConfigClient.fetchDcConfig(partnerCode);
                Object raw = dcConfig.get("homeDiscount");
                if (raw instanceof Number num) {
                    dcRate = BigDecimal.valueOf(num.doubleValue());
                }
            } catch (RuntimeException ex) {
                log.warn("DC config fail-soft: {}", ex.getMessage());
            }
        }

        // preview line 생성
        List<VendorOrderUploadResponse.PreviewLine> previewLines = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<String> suggestions = new ArrayList<>();

        for (ParsedVendorOrder.Line line : parsed.lines()) {
            CatalogEntry entry = catalog.get(line.modelCode());
            BigDecimal unitPrice;
            String source;
            if (entry != null && entry.unitPrice().signum() > 0) {
                unitPrice = entry.unitPrice();
                source = "CATALOG";
            } else if (line.unitPrice() != null && line.unitPrice().signum() > 0) {
                unitPrice = line.unitPrice();
                source = "OCR";
                suggestions.add("모델 " + line.modelCode() + " 시트 단가 미발견 — OCR 단가 사용");
            } else {
                unitPrice = BigDecimal.ZERO;
                source = "MANUAL";
                suggestions.add("모델 " + line.modelCode() + " 단가 누락 — 수동 입력 필요");
            }
            BigDecimal finalPrice = unitPrice.multiply(BigDecimal.ONE.subtract(dcRate))
                    .setScale(0, RoundingMode.HALF_UP);
            BigDecimal subtotal = finalPrice.multiply(BigDecimal.valueOf(line.quantity()));
            totalAmount = totalAmount.add(subtotal);
            String displayName = entry != null && entry.productName() != null && !entry.productName().isBlank()
                    ? entry.productName() : line.productName();
            previewLines.add(new VendorOrderUploadResponse.PreviewLine(
                    displayName, line.modelCode(), line.quantity(),
                    unitPrice, dcRate, finalPrice, subtotal, source));
        }

        if (partnerCode == null || partnerCode.isBlank()) {
            suggestions.add("거래처 코드 인식 실패 — confirm 시 명시 필요");
        } else {
            Optional<PartnerSummary> ps = partnerLookupClient.findByPartnerCode(partnerCode);
            if (ps.isEmpty()) {
                suggestions.add("거래처 코드 " + partnerCode + " 검증 실패 — partner-service 확인");
            }
        }
        if (parsed.totalAmount() != null && parsed.totalAmount().signum() > 0
                && totalAmount.compareTo(parsed.totalAmount()) != 0) {
            suggestions.add("OCR 합계와 라인 합산 불일치 — 수동 검증 권장");
        }

        return new VendorOrderUploadResponse(
                parser.vendorName(),
                partnerCode,
                truncate(ocrText),
                previewLines,
                totalAmount,
                parsed.totalAmount(),
                suggestions);
    }

    /**
     * confirm 흐름: 사용자가 검증/수정한 라인을 받아 PartnerOrder 발급.
     *
     * <p>본 슬라이스는 vendor 발주서를 새 PartnerOrder 로 등록하는 entry 까지만 책임 (M5 slip
     * 발행은 기존 PartnerOrderConfirmService 흐름과 별도 — vendor 발주는 자체 orderNo 만 부여).
     */
    public VendorOrderConfirmResponse confirm(VendorOrderConfirmRequest request, String actorUserId) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "request 비어있음");
        }
        Optional<PartnerSummary> ps = partnerLookupClient.findByPartnerCode(request.partnerCode());
        if (ps.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "거래처 미발견: " + request.partnerCode());
        }

        BigDecimal total = BigDecimal.ZERO;
        for (VendorOrderConfirmRequest.ConfirmLine line : request.lines()) {
            BigDecimal subtotal = line.finalPrice().multiply(BigDecimal.valueOf(line.quantity()));
            total = total.add(subtotal);
        }

        // 본 슬라이스: 사용자 표시 orderNo 만 부여. 실제 PartnerOrder entity 등록은 후속 슬라이스
        // (PartnerOrderConfirmService 와 합치는 흐름은 PR-F2 외 slice 에서 통합).
        String orderNo = nextOrderNo();
        log.info("vendor 발주 confirm: vendor={}, partnerCode={}, orderNo={}, total={}, actor={}",
                request.vendorName(), request.partnerCode(), orderNo, total, actorUserId);

        return new VendorOrderConfirmResponse(
                orderNo, request.vendorName(), request.partnerCode(), total, "REGISTERED");
    }

    /** OCR engine bean 가드. 미등록 시 BusinessException(INTERNAL_ERROR) — controller 가 503 변환. */
    private OcrEngine ensureOcrEnabled() {
        OcrEngine engine = ocrEngineProvider.getIfAvailable();
        if (engine == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "OCR 미사용 — samhan.partner-order.ocr.enabled=true 필요 (DevOps Tesseract setup)");
        }
        return engine;
    }

    /** vendor 식별 — hint 우선, 없으면 OCR text 자동 감지. */
    private VendorOrderParser resolveParser(String vendorHint, String ocrText) {
        Optional<VendorOrderParser> byName = parserRegistry.resolveByName(vendorHint);
        if (byName.isPresent()) {
            return byName.get();
        }
        Optional<VendorOrderParser> auto = parserRegistry.autoDetect(ocrText);
        if (auto.isPresent()) {
            return auto.get();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "vendor 식별 실패 — 지원 vendor: " + parserRegistry.registeredVendors());
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        return b;
    }

    private static String truncate(String text) {
        if (text == null) {
            return "";
        }
        return text.length() <= OCR_TEXT_MAX_PREVIEW
                ? text : text.substring(0, OCR_TEXT_MAX_PREVIEW) + "...[truncated]";
    }

    private String nextOrderNo() {
        LocalDate today = LocalDate.now();
        synchronized (VendorOrderService.class) {
            if (!today.equals(inMemoryOrderDate)) {
                inMemoryOrderDate = today;
                inMemoryOrderSeq = 0;
            }
            inMemoryOrderSeq += 1;
            return today.format(ORDER_NO_DATE) + "-" + inMemoryOrderSeq;
        }
    }
}
