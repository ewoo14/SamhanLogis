package com.samhanair.logis.partnerorder.client;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import jakarta.annotation.PostConstruct;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 구글 Sheets v4 API 클라이언트 — partner-order-service 전용 (PR-D Part 1).
 *
 * <p><b>출처</b>: PR-D Part 1 시트 흐름 보강 — partner-order-service 의 BootstrapService 가
 * 부팅 시 17 cache key prefetch 시 시트 직접 read. {@code services/product-service/.../client/GoogleSheetsClient}
 * 1:1 복제 (Service Account JWT, Caffeine 5분 TTL). Samhan Public 자체 service 안에서
 * 시트 read — 외부 시스템 호출 X (legacy estimate-app 패턴 보존).
 *
 * <p><b>인증</b>: Google Service Account (JWT). JSON key 경로는 환경변수
 * {@code GOOGLE_SERVICE_ACCOUNT_KEY} (default {@code /etc/samhan/sa-key.json}).
 * 시크릿은 .env / SSH 직접 배포; 본 코드 path placeholder 만 보유.
 *
 * <p><b>캐시</b>: Caffeine 5분 TTL — bootstrap prefetch 와 admin 동시 호출 시 시트 API
 * quota (per-minute 60 read) 가드. cache key = {@code sheetId|range|renderOption} (3 mode 별
 * 별도 캐시 — UNFORMATTED / FORMATTED / FORMULA).
 *
 * <p><b>endpoint override</b>: {@code google.sheets.endpoint-override} (테스트 시 WireMock URL).
 * 비어있으면 default {@code https://sheets.googleapis.com}.
 */
@Component
public class GoogleSheetsClient {

    private static final Logger log = LoggerFactory.getLogger(GoogleSheetsClient.class);

    private static final String APPLICATION_NAME = "samhanair-partner-order-service";

    /**
     * 시트 cell value render mode — legacy SpreadsheetApp Range API 의 3 method 와 1:1 대응.
     *
     * <p>Sheets v4 API 의 {@code spreadsheets.values.get?valueRenderOption=...} query parameter 로 매핑:
     * <ul>
     *     <li>{@link #UNFORMATTED} → {@code UNFORMATTED_VALUE} (legacy {@code getValues()})</li>
     *     <li>{@link #FORMATTED} → {@code FORMATTED_VALUE} (legacy {@code getDisplayValues()})</li>
     *     <li>{@link #FORMULA} → {@code FORMULA} (legacy {@code getFormulas()})</li>
     * </ul>
     */
    public enum ValueRenderMode {
        /** legacy {@code Range.getValues()} 동등 — raw cell value (number/string), 포맷 미적용. */
        UNFORMATTED,
        /** legacy {@code Range.getDisplayValues()} 동등 — 사용자 표시 그대로 (천단위 콤마/통화 포함). */
        FORMATTED,
        /** legacy {@code Range.getFormulas()} 동등 — formula 문자열 자체 (없으면 빈 문자열). */
        FORMULA
    }

    @Value("${google.sheets.service-account-key-path:/etc/samhan/sa-key.json}")
    private String serviceAccountKeyPath;

    @Value("${google.sheets.endpoint-override:}")
    private String endpointOverride;

    @Value("${google.sheets.cache-ttl-minutes:5}")
    private long cacheTtlMinutes;

    /** 캐시: key = "{sheetId}|{range}|{renderOption}", value = ValueRange. 3 mode 별 별도 캐시. */
    private Cache<String, ValueRange> cache;

    private Sheets sheets;

    @PostConstruct
    public void init() {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(cacheTtlMinutes))
                .maximumSize(200)
                .build();
        // sheets 인스턴스는 lazy — 첫 read 호출 시 build (Service Account JSON 부재 시 부팅 fail X).
    }

    /**
     * 시트 단일 range 의 값 2D 반환 — render mode 별 (legacy SpreadsheetApp 의
     * {@code getValues / getDisplayValues / getFormulas} 동등). Caffeine 캐시 5분 TTL.
     *
     * @param sheetId 구글 시트 ID
     * @param range A1 표기 (예: {@code 홈멀티!A1:Z})
     * @param mode {@link ValueRenderMode}
     * @return cell value 2D (빈 시트 = empty list)
     * @throws IOException 시트 read 실패 (인증 / network / quota)
     * @throws GeneralSecurityException SDK transport 초기화 실패
     */
    public List<List<Object>> readSheet(String sheetId, String range, ValueRenderMode mode)
            throws IOException, GeneralSecurityException {
        if (mode == null) {
            mode = ValueRenderMode.UNFORMATTED;
        }
        String renderOption = switch (mode) {
            case UNFORMATTED -> "UNFORMATTED_VALUE";
            case FORMATTED -> "FORMATTED_VALUE";
            case FORMULA -> "FORMULA";
        };
        String cacheKey = sheetId + "|" + range + "|" + renderOption;
        ValueRange cached = cache.getIfPresent(cacheKey);
        if (cached != null) {
            log.debug("[GoogleSheetsClient] cache hit: {}", cacheKey);
            return cached.getValues() == null ? Collections.emptyList() : cached.getValues();
        }

        Sheets svc = sheetsService();
        ValueRange resp = svc.spreadsheets().values().get(sheetId, range)
                .setValueRenderOption(renderOption)
                .execute();
        cache.put(cacheKey, resp);
        log.info("[GoogleSheetsClient] sheet read: id={}, range={}, render={}, rows={}",
                sheetId, range, renderOption, resp.getValues() == null ? 0 : resp.getValues().size());
        return resp.getValues() == null ? Collections.emptyList() : resp.getValues();
    }

    /**
     * legacy {@code Range.getValues()} 호환 — 기본 {@link ValueRenderMode#UNFORMATTED}.
     */
    public List<List<Object>> readSheet(String sheetId, String range)
            throws IOException, GeneralSecurityException {
        return readSheet(sheetId, range, ValueRenderMode.UNFORMATTED);
    }

    /**
     * legacy {@code Range.getDisplayValues()} 호환 — {@link ValueRenderMode#FORMATTED}.
     */
    public List<List<Object>> readSheetDisplay(String sheetId, String range)
            throws IOException, GeneralSecurityException {
        return readSheet(sheetId, range, ValueRenderMode.FORMATTED);
    }

    /**
     * legacy {@code Range.getFormulas()} 호환 — {@link ValueRenderMode#FORMULA}.
     */
    public List<List<Object>> readSheetFormulas(String sheetId, String range)
            throws IOException, GeneralSecurityException {
        return readSheet(sheetId, range, ValueRenderMode.FORMULA);
    }

    /** 캐시 강제 무효화 — admin trigger 시 호출. 3 mode 모두 invalidate. */
    public void invalidateCache() {
        if (cache != null) {
            cache.invalidateAll();
            log.info("[GoogleSheetsClient] cache invalidated (admin trigger)");
        }
    }

    /** Sheets SDK lazy 생성 — Service Account JSON 미존재 시 IOException 던짐. */
    private synchronized Sheets sheetsService() throws IOException, GeneralSecurityException {
        if (sheets != null) {
            return sheets;
        }
        Path keyPath = Path.of(serviceAccountKeyPath);
        if (!Files.exists(keyPath)) {
            throw new IOException(
                    "Service Account JSON 키가 존재하지 않습니다: " + serviceAccountKeyPath
                            + " — GOOGLE_SERVICE_ACCOUNT_KEY 환경변수 확인");
        }
        NetHttpTransport transport = GoogleNetHttpTransport.newTrustedTransport();
        GoogleCredentials credentials;
        try (FileInputStream in = new FileInputStream(keyPath.toFile())) {
            credentials = GoogleCredentials.fromStream(in)
                    .createScoped(List.of(SheetsScopes.SPREADSHEETS_READONLY));
        }
        Sheets.Builder builder = new Sheets.Builder(transport, GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(credentials))
                .setApplicationName(APPLICATION_NAME);
        if (endpointOverride != null && !endpointOverride.isBlank()) {
            // WireMock 등 IT 에서 SDK 의 rootUrl 강제 교체
            builder.setRootUrl(endpointOverride);
            log.info("[GoogleSheetsClient] endpoint override = {}", endpointOverride);
        }
        sheets = builder.build();
        return sheets;
    }

    /**
     * 셀 row → 문자열 list 변환 헬퍼 (null cell → "").
     * 시트 row 가 trailing empty cell 을 자르는 경우 padToCols 로 길이 맞춤.
     */
    public static List<String> toStringRow(List<Object> row, int padToCols) {
        List<String> out = new ArrayList<>(Math.max(padToCols, row == null ? 0 : row.size()));
        if (row != null) {
            for (Object o : row) {
                out.add(o == null ? "" : o.toString());
            }
        }
        while (out.size() < padToCols) {
            out.add("");
        }
        return out;
    }
}
