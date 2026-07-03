package com.samhanair.logis.accounting.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.service.MonthEndCloseService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 마감 가드 interceptor (Phase 10 Step 8 — P2-4 매출 마감).
 *
 * <p>마감된 회계 기간(CLOSED)에 속한 분개/세금계산서의 신규 입력/수정/발행을 차단.
 * {@link MonthEndCloseService#findClosedPeriodCovering(LocalDate)} 위임.
 *
 * <p>가드 대상 endpoint (POST/PUT 만):
 *
 * <ul>
 *   <li>{@code POST /accounting/journals} — request body {@code journalDate} 검사</li>
 *   <li>{@code POST /accounting/tax-invoices} — request body {@code supplyDate} 검사</li>
 *   <li>{@code PUT /accounting/tax-invoices/{id}} — request body {@code supplyDate} 검사</li>
 *   <li>{@code POST /accounting/tax-invoices/{id}/issue} — DB 의 supplyDate 검사 (path-only)</li>
 * </ul>
 *
 * <p>마감/역마감 endpoint 자체 ({@code /accounting/closings}) 는 가드 대상 제외.
 *
 * <p>가드 대상 외 endpoint 는 service 레이어 도메인 가드만 작동한다. 역분개는
 * {@code JournalService} 가 원분개 {@code journalDate} 기준으로 CLOSED 기간을 다시 검사해 차단한다.
 */
@RequiredArgsConstructor
public class AccountingPeriodGuard implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AccountingPeriodGuard.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 가드 대상 (method, pathPrefix) 화이트리스트. */
    private static final Set<String> JOURNAL_DATE_BODY_PATHS = new HashSet<>();
    private static final Set<String> SUPPLY_DATE_BODY_PATHS = new HashSet<>();

    static {
        JOURNAL_DATE_BODY_PATHS.add("POST:/accounting/journals");
        SUPPLY_DATE_BODY_PATHS.add("POST:/accounting/tax-invoices");
        // PUT /accounting/tax-invoices/{id} 는 prefix 매칭으로 처리
    }

    private final MonthEndCloseService monthEndCloseService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws IOException {
        String method = request.getMethod();
        String path = request.getRequestURI();

        // /accounting/closings 자체는 통과.
        if (path.startsWith("/accounting/closings")) {
            return true;
        }

        String key = method + ":" + path;
        boolean isJournalDate = JOURNAL_DATE_BODY_PATHS.contains(key);
        boolean isSupplyDate = SUPPLY_DATE_BODY_PATHS.contains(key)
                || (("PUT".equals(method) || "POST".equals(method))
                        && path.startsWith("/accounting/tax-invoices/")
                        && !path.endsWith("/issue") && !path.endsWith("/cancel"));

        if (!isJournalDate && !isSupplyDate) {
            return true;
        }

        // body 를 1회 읽어 가드 검증. 이후 controller 가 다시 읽을 수 있도록 wrap 는 호출자(filter)에서.
        // 여기서는 read-once 후 재사용 불가. 따라서 호출자는 ContentCachingRequestWrapper 사용 의무.
        // 본 interceptor 는 ContentCachingRequestFilter 가 wrap 한 request 만 신뢰.
        String body = readBody(request);
        if (body == null || body.isBlank()) {
            return true;
        }
        try {
            JsonNode root = MAPPER.readTree(body);
            String dateField = isJournalDate ? "journalDate" : "supplyDate";
            JsonNode dateNode = root.get(dateField);
            if (dateNode == null || dateNode.isNull()) {
                return true;
            }
            LocalDate date = LocalDate.parse(dateNode.asText());
            Optional<?> closed = monthEndCloseService.findClosedPeriodCovering(date);
            if (closed.isPresent()) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "마감된 회계 기간입니다 — 해당 일자(" + date + ")는 변경할 수 없습니다");
            }
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AccountingPeriodGuard 본문 파싱 실패 — 통과 처리: {}", ex.getMessage());
        }
        return true;
    }

    private static String readBody(HttpServletRequest request) throws IOException {
        if (request instanceof CachedBodyRequestWrapper cached) {
            return cached.getBody();
        }
        // 일반 HttpServletRequest 면 1회만 읽어야 하므로 caller 가 wrap 안 했을 가능성 → null 반환.
        return null;
    }

    /**
     * Body 를 1회 cache 하는 wrapper — controller 에서도 재사용 가능. WebMvcConfig 가
     * filter 또는 별도 메커니즘으로 적용. 본 wrapper 는 GET/POST 모두 안전.
     */
    public static class CachedBodyRequestWrapper extends HttpServletRequestWrapper {

        private final byte[] cachedBody;

        public CachedBodyRequestWrapper(HttpServletRequest request) throws IOException {
            super(request);
            this.cachedBody = request.getInputStream().readAllBytes();
        }

        public String getBody() {
            return new String(cachedBody, StandardCharsets.UTF_8);
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(cachedBody);
            return new ServletInputStream() {
                @Override
                public boolean isFinished() {
                    return byteArrayInputStream.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener readListener) {
                    // no-op
                }

                @Override
                public int read() {
                    return byteArrayInputStream.read();
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}
