package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.financial.VatAmountCalculator;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 거래처 주문 인쇄 HTML 렌더링 서비스.
 *
 * <p>브라우저 새 탭에서 바로 인쇄 가능한 A4 HTML 을 생성한다. UUID 는 본문에 포함하지 않고
 * 주문번호/거래처 코드/사업자번호 같은 업무 식별자만 노출한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerOrderPrintService {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 주문번호 또는 내부 UUID 문자열로 인쇄 HTML 을 생성한다.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param callerPartnerCode PARTNER 본인 거래처 코드
     * @return 인쇄 전용 HTML
     */
    public String renderPrintHtml(String id, String callerPartnerCode) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        assertPartnerOwnOrder(order, callerPartnerCode);
        return render(order);
    }

    /**
     * PARTNER 계정이면 본인 거래처 주문서인지 검증한다.
     *
     * <p>Phase C5-4 P0 수정 — PARTNER 식별을 SecurityContext {@code ROLE_PARTNER} authority 에서
     * {@code X-Is-Partner} 헤더로 전환한다. 게이트웨이가 JWT {@code partnerCode} claim 기반으로
     * 강제 override 하므로 신뢰한다.
     *
     * @param order 조회 대상 주문
     * @param callerPartnerCode {@code X-Partner-Code} 헤더 값
     */
    private void assertPartnerOwnOrder(PartnerOrder order, String callerPartnerCode) {
        if (!isPartnerAuthority()) {
            return;
        }
        if (callerPartnerCode == null || callerPartnerCode.isBlank()
                || !order.getPartnerCode().equals(callerPartnerCode.trim())) {
            throw new AccessDeniedException("본인 거래처 주문서만 인쇄할 수 있습니다.");
        }
    }

    /**
     * 현재 요청이 PARTNER 계정에서 온 것인지 {@code X-Is-Partner} 헤더로 판정한다.
     *
     * <p>Phase C5-4 P0: 게이트웨이가 JWT {@code partnerCode} claim 기반으로 강제 override 하므로
     * SecurityContext ROLE_PARTNER authority 대신 헤더를 신뢰한다.
     *
     * @return X-Is-Partner=true 이면 true
     */
    private boolean isPartnerAuthority() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) {
                return false;
            }
            HttpServletRequest request = attrs.getRequest();
            String isPartner = request.getHeader(HttpHeaderConstants.IS_PARTNER_HEADER);
            return "true".equalsIgnoreCase(isPartner);
        } catch (Exception e) {
            return false;
        }
    }

    private String render(PartnerOrder order) {
        BigDecimal total = order.getTotalAmount() == null ? BigDecimal.ZERO : order.getTotalAmount();
        // 신규 라인은 저장된 S/V 스냅샷을 사용하고, legacy 행은 기존 T(subtotal) 의미를
        // 공통 계산기로 역산한다. 기존 저장 레코드를 소급 변경하지 않는다.
        boolean hasCompleteLineAmounts = !order.getLines().isEmpty()
                && order.getLines().stream().allMatch(line -> line.getSupplyAmount() != null
                        && line.getVatAmount() != null);
        BigDecimal supply;
        BigDecimal vat;
        if (hasCompleteLineAmounts) {
            supply = order.getLines().stream().map(PartnerOrderLine::getSupplyAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            vat = order.getLines().stream().map(PartnerOrderLine::getVatAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } else {
            VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(total);
            supply = split.supplyAmount();
            vat = split.vatAmount();
        }
        String partnerName = partnerLookupClient.findByPartnerCode(order.getPartnerCode())
                .map(PartnerSummary::name)
                .filter(name -> !name.isBlank())
                .orElse(order.getPartnerCode());

        StringBuilder rows = new StringBuilder();
        int index = 1;
        for (PartnerOrderLine line : order.getLines()) {
            rows.append("""
                    <tr>
                      <td class="center">%d</td>
                      <td>%s</td>
                      <td>%s</td>
                      <td>%s</td>
                      <td class="number">%d</td>
                      <td class="number">%s</td>
                      <td class="number">%s</td>
                    </tr>
                    """.formatted(
                    index++,
                    escape(line.getProductName()),
                    escape(line.getModelName()),
                    escape(categoryLabel(line.getCategoryKey())),
                    line.getQuantity(),
                    money(line.getPriceVat()),
                    money(line.getSubtotal())));
        }

        return """
                <!doctype html>
                <html lang="ko">
                <head>
                  <meta charset="UTF-8">
                  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>주문서 %s</title>
                  <style>
                    @font-face {
                      font-family: 'Pretendard';
                      src: local('Pretendard');
                      font-weight: 400 800;
                    }
                    * { box-sizing: border-box; }
                    body {
                      margin: 0;
                      background: #eef1f5;
                      color: #111827;
                      font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic', system-ui, sans-serif;
                      font-size: 12px;
                    }
                    .page {
                      width: 210mm;
                      min-height: 297mm;
                      margin: 12mm auto;
                      padding: 14mm;
                      background: #fff;
                      border: 1px solid #d1d5db;
                    }
                    .document-title {
                      margin: 0 0 10mm;
                      text-align: center;
                      font-size: 24px;
                      letter-spacing: 0;
                      font-weight: 800;
                    }
                    .meta-grid {
                      display: grid;
                      grid-template-columns: 1fr 1fr;
                      gap: 4mm;
                      margin-bottom: 7mm;
                    }
                    .box {
                      border: 1px solid #1f2937;
                    }
                    .box-title {
                      padding: 2mm 3mm;
                      background: #f3f4f6;
                      border-bottom: 1px solid #1f2937;
                      font-weight: 700;
                    }
                    .info-row {
                      display: grid;
                      grid-template-columns: 28mm 1fr;
                      min-height: 9mm;
                      border-bottom: 1px solid #d1d5db;
                    }
                    .info-row:last-child { border-bottom: 0; }
                    .info-label {
                      padding: 2mm 3mm;
                      background: #f9fafb;
                      border-right: 1px solid #d1d5db;
                      font-weight: 700;
                    }
                    .info-value { padding: 2mm 3mm; }
                    table {
                      width: 100%%;
                      border-collapse: collapse;
                    }
                    tr { page-break-inside: avoid; }
                    th, td {
                      border: 1px solid #1f2937;
                      padding: 2mm;
                      vertical-align: middle;
                    }
                    th {
                      background: #f3f4f6;
                      font-weight: 700;
                      text-align: center;
                    }
                    .center { text-align: center; }
                    .number { text-align: right; font-variant-numeric: tabular-nums; }
                    .summary {
                      width: 74mm;
                      margin: 6mm 0 8mm auto;
                    }
                    .sign-grid {
                      display: grid;
                      grid-template-columns: 1fr 1fr;
                      gap: 7mm;
                      margin-top: 8mm;
                    }
                    .sign-box {
                      height: 28mm;
                      border: 1px solid #1f2937;
                      display: grid;
                      grid-template-rows: 9mm 1fr;
                    }
                    .sign-title {
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      border-bottom: 1px solid #1f2937;
                      background: #f9fafb;
                      font-weight: 700;
                    }
                    .memo {
                      min-height: 18mm;
                      margin-top: 6mm;
                      padding: 3mm;
                      border: 1px solid #1f2937;
                      white-space: pre-wrap;
                    }
                    @media print {
                      @page { size: A4; margin: 0; }
                      body { background: #fff; }
                      thead { display: table-header-group; }
                      tfoot { display: table-footer-group; }
                      tr { page-break-inside: avoid; }
                      .summary, .memo, .sign-grid { break-inside: avoid; }
                      .page {
                        width: 210mm;
                        min-height: 297mm;
                        margin: 0;
                        border: 0;
                        page-break-after: avoid;
                      }
                    }
                  </style>
                </head>
                <body>
                  <main class="page">
                    <h1 class="document-title">거래처 주문서</h1>
                    <section class="meta-grid" aria-label="주문 기본 정보">
                      <div class="box">
                        <div class="box-title">거래처 정보</div>
                        <div class="info-row"><div class="info-label">거래처명</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">거래처 코드</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">사업자번호</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">연락처</div><div class="info-value">-</div></div>
                        <div class="info-row"><div class="info-label">주소</div><div class="info-value">-</div></div>
                      </div>
                      <div class="box">
                        <div class="box-title">주문 정보</div>
                        <div class="info-row"><div class="info-label">주문번호</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">주문일시</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">납기</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">전표번호</div><div class="info-value">%s</div></div>
                        <div class="info-row"><div class="info-label">상태</div><div class="info-value">%s</div></div>
                      </div>
                    </section>
                    <table aria-label="주문 품목">
                      <thead>
                        <tr>
                          <th style="width: 10mm;">No</th>
                          <th>품명</th>
                          <th>모델명</th>
                          <th style="width: 24mm;">구분</th>
                          <th style="width: 16mm;">수량</th>
                          <th style="width: 27mm;">단가</th>
                          <th style="width: 30mm;">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                %s
                      </tbody>
                    </table>
                    <table class="summary" aria-label="합계">
                      <tbody>
                        <tr><th>소계</th><td class="number">%s</td></tr>
                        <tr><th>부가세</th><td class="number">%s</td></tr>
                        <tr><th>합계</th><td class="number">%s</td></tr>
                      </tbody>
                    </table>
                    <div class="memo"><strong>요청사항</strong><br>%s</div>
                    <section class="sign-grid" aria-label="날인란">
                      <div class="sign-box"><div class="sign-title">사용자 확인</div><div></div></div>
                      <div class="sign-box"><div class="sign-title">거래처 확인</div><div></div></div>
                    </section>
                  </main>
                </body>
                </html>
                """.formatted(
                escape(order.getOrderNo()),
                escape(partnerName),
                escape(order.getPartnerCode()),
                escape(order.getBizCode()),
                escape(order.getOrderNo()),
                escape((order.getConfirmedAt() == null ? order.getCreatedAt() : order.getConfirmedAt()).format(DATE_TIME)),
                order.getDueDate() == null ? "-" : escape(order.getDueDate().toString()),
                order.getSlipNo() == null ? "-" : escape(order.getSlipNo()),
                escape(order.getStatus().getDisplayName()),
                rows,
                money(supply),
                money(vat),
                money(total),
                escape(order.getMemo() == null ? "-" : order.getMemo()));
    }

    private String categoryLabel(String categoryKey) {
        return switch (nullToEmpty(categoryKey)) {
            case "homemulti" -> "홈멀티";
            case "singleSets" -> "싱글중대형";
            case "commercialMulti" -> "상업멀티";
            case "oldProducts" -> "구형";
            default -> "기타";
        };
    }

    private String money(BigDecimal value) {
        BigDecimal safeValue = value == null ? BigDecimal.ZERO : value;
        return String.format(Locale.KOREA, "%,.0f", safeValue);
    }

    private String escape(String value) {
        return nullToEmpty(value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
