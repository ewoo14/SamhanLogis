package com.samhanair.logis.notification.client;

import com.opencsv.CSVReader;
import com.samhanair.logis.notification.client.AligoAddressBookClient.AligoContact;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.apache.commons.io.input.BOMInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Phase 10 PR-F1 BE-1 — {@link AligoCsvSourceClient} 의 RestClient 기반 production 구현체.
 *
 * <p>partner-service 의 {@code GET /admin/partners/export/aligo-csv} 를 호출하여 UTF-8 BOM CSV 를
 * 다운받은 후 {@link AligoContact} 리스트로 parse. 인증은 {@code X-Internal-Token} 헤더 사용
 * ({@link RestClientPartnerLookupClient} 와 동일 패턴).
 *
 * <h2>활성 가드</h2>
 * <ul>
 *   <li>{@link Profile @Profile("!test")} — test profile 에서 {@code @MockBean} 으로 격리
 *       (memory feedback_it_mockbean_external_clients).</li>
 *   <li>{@link ConditionalOnProperty} — {@code samhan.notification.aligo-csv-source.enabled=true}
 *       (default true) 토글로 외부 호출 회피 가능.</li>
 * </ul>
 *
 * <h2>주의</h2>
 * <p>partner-service Part A controller 의 endpoint 는 {@code @PreAuthorize("hasAnyRole('MASTER','MANAGER')")}
 * 가드. 따라서 본 client 호출 시 partner-service 측 SecurityConfig + InternalTokenFilter 가
 * X-Internal-Token → ROLE_MASTER 매핑을 처리해야 한다 (기존 internal endpoint 가 이미 동일 패턴).
 * production deployment 시 {@code SAMHAN_INTERNAL_TOKEN} env var 주입 필수.
 */
@Component
@Profile("!test")
@ConditionalOnProperty(prefix = "samhan.notification.aligo-csv-source", name = "enabled",
        havingValue = "true", matchIfMissing = true)
public class RestClientAligoCsvSourceClient implements AligoCsvSourceClient {

    private static final Logger log = LoggerFactory.getLogger(RestClientAligoCsvSourceClient.class);

    private final RestClient.Builder builder;
    private final String baseUrl;
    private final String internalToken;

    public RestClientAligoCsvSourceClient(
            RestClient.Builder builder,
            @Value("${samhan.partner-service.url:http://localhost:8095}") String baseUrl,
            @Value("${app.security.internal.token:}") String internalToken) {
        this.builder = builder;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
    }

    @Override
    public List<AligoContact> fetchContacts() {
        if (internalToken == null || internalToken.isBlank()) {
            log.warn("AligoCsvSourceClient — X-Internal-Token 미설정 (app.security.internal.token), fetch 건너뜀");
            return List.of();
        }
        try {
            RestClient client = builder.baseUrl(baseUrl).build();
            byte[] csv = client.get()
                    .uri("/internal/partners/export/aligo-csv")
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(byte[].class);
            if (csv == null || csv.length == 0) {
                return List.of();
            }
            return parseCsv(csv);
        } catch (Exception ex) {
            log.warn("AligoCsvSourceClient.fetchContacts 호출 실패 — msg={}", ex.getMessage());
            return List.of();
        }
    }

    /**
     * CSV byte → contact 리스트 (UTF-8 BOM 제거 + 헤더 skip + 4 컬럼 매핑).
     *
     * <p>visibility = package-private — 단위 테스트 직접 호출 의도.
     */
    List<AligoContact> parseCsv(byte[] csv) {
        List<AligoContact> result = new ArrayList<>();
        try (BOMInputStream bomFree = BOMInputStream.builder()
                .setInputStream(new ByteArrayInputStream(csv)).get();
             InputStreamReader isr = new InputStreamReader(bomFree, StandardCharsets.UTF_8);
             BufferedReader br = new BufferedReader(isr);
             CSVReader reader = new CSVReader(br)) {
            String[] header = reader.readNext();
            if (header == null) {
                return List.of();
            }
            String[] row;
            while ((row = reader.readNext()) != null) {
                if (row.length < 4) {
                    continue;
                }
                String group = row[0] == null ? "" : row[0].trim();
                String name = row[1] == null ? "" : row[1].trim();
                String phone = row[2] == null ? "" : row[2].trim();
                String memo = row[3] == null ? "" : row[3].trim();
                if (name.isEmpty() || phone.isEmpty()) {
                    continue;
                }
                result.add(new AligoContact(group, name, phone, memo));
            }
        } catch (Exception ex) {
            log.warn("AligoCsvSourceClient.parseCsv 실패 — msg={}", ex.getMessage());
            return List.of();
        }
        return result;
    }
}
