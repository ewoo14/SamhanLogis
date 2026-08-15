package com.samhanair.logis.partner.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.dto.BlockedPartnerImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Phase 10 PR-D Part B — {@link PartnerBlockImportService} 단위 테스트.
 *
 * <p>커버: 5 row 정상 import / lookup miss reject / 한국어 datetime 파싱 / UTF-8 BOM 제거.
 */
@ExtendWith(MockitoExtension.class)
class PartnerBlockImportServiceTest {

    private static final byte[] UTF8_BOM = new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };

    @Mock
    private PartnerService partnerService;

    @Mock
    private PartnerBlockService blockService;

    @InjectMocks
    private PartnerBlockImportService service;

    private Partner stub(String code, String name) {
        return Partner.register(code, "999-88-77777", name, null, null, BigDecimal.ZERO);
    }

    private InputStream csvStream(String body, boolean withBom) {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        if (withBom) {
            byte[] full = new byte[payload.length + UTF8_BOM.length];
            System.arraycopy(UTF8_BOM, 0, full, 0, UTF8_BOM.length);
            System.arraycopy(payload, 0, full, UTF8_BOM.length, payload.length);
            return new ByteArrayInputStream(full);
        }
        return new ByteArrayInputStream(payload);
    }

    @Test
    void importCsv_5rows_allMatched_imports5() {
        String csv = "이카운트 사업자명,생성 일시\n"
                + "주식회사 삼성이엔지 (윤정희),2026년 4월 26일 오전 7:36\n"
                + "에스원이엔지 (주),2026년 4월 26일 오전 7:36\n"
                + "훼밀리공조 주식회사,2026년 4월 26일 오전 7:36\n"
                + "(주)을지공조시스템,2026년 4월 26일 오전 7:36\n"
                + "(주)에어뱅크,2026년 4월 26일 오전 7:36\n";

        when(partnerService.findByNameForLookup("주식회사 삼성이엔지 (윤정희)"))
                .thenReturn(Optional.of(stub("P-2026-0001", "주식회사 삼성이엔지 (윤정희)")));
        when(partnerService.findByNameForLookup("에스원이엔지 (주)"))
                .thenReturn(Optional.of(stub("P-2026-0002", "에스원이엔지 (주)")));
        when(partnerService.findByNameForLookup("훼밀리공조 주식회사"))
                .thenReturn(Optional.of(stub("P-2026-0003", "훼밀리공조 주식회사")));
        when(partnerService.findByNameForLookup("(주)을지공조시스템"))
                .thenReturn(Optional.of(stub("P-2026-0004", "(주)을지공조시스템")));
        when(partnerService.findByNameForLookup("(주)에어뱅크"))
                .thenReturn(Optional.of(stub("P-2026-0005", "(주)에어뱅크")));
        when(blockService.isBlocked(anyString())).thenReturn(false);

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, true), "admin-1");

        assertThat(result.totalRows()).isEqualTo(5);
        assertThat(result.imported()).isEqualTo(5);
        assertThat(result.alreadyBlocked()).isZero();
        assertThat(result.rejected()).isEmpty();

        verify(blockService, times(5)).block(anyString(), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), anyString());
    }

    @Test
    void importCsv_lookupMiss_preservesLegacyAlias() {
        String csv = "이카운트 사업자명,생성 일시\n"
                + "존재하지않는상호,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByNameForLookup("존재하지않는상호")).thenReturn(Optional.empty());

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, false), "admin-1");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        verify(blockService).blockLegacySnapshot(anyString(), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), eq("존재하지않는상호"));
        verify(blockService, never()).block(anyString(), any(), any(), anyString(), anyString());
    }

    @Test
    void importCsv_invalidDatetime_rejectsRow() {
        String csv = "이카운트 사업자명,생성 일시\n"
                + "(주)에어뱅크,잘못된 날짜 형식\n";
        // datetime 파싱 실패 → lookup 호출 전 reject 되므로 lenient 로 stub
        lenient().when(partnerService.findByNameForLookup(anyString())).thenReturn(Optional.empty());

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, false), "admin-1");

        assertThat(result.rejected()).hasSize(1);
        assertThat(result.rejected().get(0).reason()).contains("PARSE_ERROR");
        verify(partnerService, never()).findByNameForLookup(anyString());
    }

    @Test
    void importCsv_alreadyBlocked_skipsAndCountsAlreadyBlocked() {
        String csv = "이카운트 사업자명,생성 일시\n"
                + "(주)에어뱅크,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByNameForLookup("(주)에어뱅크"))
                .thenReturn(Optional.of(stub("P-2026-0005", "(주)에어뱅크")));
        when(blockService.isBlocked("P-2026-0005")).thenReturn(true);

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, false), "admin-1");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isZero();
        assertThat(result.alreadyBlocked()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        verify(blockService, never()).block(anyString(), any(), any(), anyString(), anyString());
    }

    @Test
    void importCsv_bomStream_doesNotPolluteHeader() {
        // BOM 처리 미적용 시 헤더 첫 컬럼이 "﻿이카운트 사업자명" 으로 매칭 실패 → 400
        // BOMInputStream wrap 검증 — BOM 포함 정상 import 1건
        String csv = "이카운트 사업자명,생성 일시\n"
                + "(주)에어뱅크,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByNameForLookup("(주)에어뱅크"))
                .thenReturn(Optional.of(stub("P-2026-0005", "(주)에어뱅크")));
        when(blockService.isBlocked("P-2026-0005")).thenReturn(false);

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, true), "admin-1");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
    }

    @Test
    void parseNotionDateTime_validKoreanFormat_returnsLocalDateTime() {
        LocalDateTime parsed = service.parseNotionDateTime("2026년 4월 26일 오전 7:36");

        assertThat(parsed).isEqualTo(LocalDateTime.of(2026, 4, 26, 7, 36));
    }

    @Test
    void parseNotionDateTime_pmFormat_handlesAfternoon() {
        LocalDateTime parsed = service.parseNotionDateTime("2026년 4월 26일 오후 3:15");

        assertThat(parsed).isEqualTo(LocalDateTime.of(2026, 4, 26, 15, 15));
    }

    @Test
    void parseNotionDateTime_sameInstantAcrossFormats_usesSameStoredAxis() {
        LocalDateTime korean = service.parseNotionDateTime("2026년 4월 26일 오전 7:36");
        LocalDateTime iso = service.parseNotionDateTime("2026-04-25 22:36:00Z");

        assertThat(iso).isEqualTo(korean);
    }

    @Test
    void importCsv_actualIsoUtcTimestamp_isImported() {
        // 실제 2026-07-28 BLOCK 원천의 헤더·사업자명·ISO 시각을 그대로 사용한다.
        String csv = "이카운트 사업자명,생성 일시\n"
                + "주식회사 삼성이엔지 (윤정희),2026-04-25 22:36:20Z\n"
                + "(주)에어뱅크,2026-04-25 22:36:54Z\n"
                + "주식회사 대승 (에스원이엔지),2026-04-25 22:36:57Z\n"
                + "(주)을지공조시스템,2026-04-25 22:36:49Z\n"
                + "에스원이엔지 (주),2026-04-25 22:36:40Z\n"
                + "훼밀리공조 주식회사,2026-04-25 22:36:46Z\n";
        String[] names = {
            "주식회사 삼성이엔지 (윤정희)", "(주)에어뱅크", "주식회사 대승 (에스원이엔지)",
            "(주)을지공조시스템", "에스원이엔지 (주)", "훼밀리공조 주식회사"
        };
        String[] codes = {
            "3128640516", "1428116616", "6348602237", "1068616876", "1138620591", "2188121662"
        };
        for (int i = 0; i < names.length; i++) {
            String name = names[i];
            String code = codes[i];
            when(partnerService.findByNameForLookup(name)).thenReturn(Optional.of(stub(code, name)));
            when(blockService.isBlocked(code)).thenReturn(false);
        }

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, false), "admin-1");

        assertThat(result.totalRows()).isEqualTo(6);
        assertThat(result.imported()).isEqualTo(6);
        assertThat(result.rejected()).isEmpty();
        verify(blockService, times(6)).block(anyString(), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), anyString());
        verify(partnerService, times(6)).findByNameForLookup(anyString());
    }

    @Test
    void parseNotionDateTime_blank_returnsNow() {
        LocalDateTime parsed = service.parseNotionDateTime("");

        assertThat(parsed).isNotNull();
    }

    @Test
    void importCsv_partnerCodeColumn_takesPrecedenceOverName() {
        // TM PR-D Part 3 — 거래처코드 우선 매핑 검증.
        String csv = "거래처코드,이카운트 사업자명,생성 일시\n"
                + "P-2026-0099,(주)에어뱅크,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByCodeForLookup("P-2026-0099"))
                .thenReturn(Optional.of(stub("P-2026-0099", "(주)에어뱅크")));
        when(blockService.isBlocked("P-2026-0099")).thenReturn(false);

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, true), "admin-1");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        // 사업자명 lookup 은 호출되면 안 됨 (코드 우선 정확 매칭 성공 시).
        verify(partnerService, org.mockito.Mockito.never()).findByNameForLookup(anyString());
        verify(partnerService).findByCodeForLookup("P-2026-0099");
        verify(blockService).block(eq("P-2026-0099"), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), eq("(주)에어뱅크"));
    }

    @Test
    void importCsv_partnerCodeMiss_fallbacksToBusinessName() {
        // TM PR-D Part 3 — 코드 검증 실패 시 사업자명 fallback 검증.
        String csv = "거래처코드,이카운트 사업자명,생성 일시\n"
                + "P-INVALID,(주)에어뱅크,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByCodeForLookup("P-INVALID")).thenReturn(Optional.empty());
        when(partnerService.findByNameForLookup("(주)에어뱅크"))
                .thenReturn(Optional.of(stub("P-2026-0005", "(주)에어뱅크")));
        when(blockService.isBlocked("P-2026-0005")).thenReturn(false);

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, true), "admin-1");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        verify(partnerService).findByCodeForLookup("P-INVALID");
        verify(partnerService).findByNameForLookup("(주)에어뱅크");
        verify(blockService).block(eq("P-2026-0005"), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), eq("(주)에어뱅크"));
    }

    @Test
    void importCsv_partnerCodeOnly_snapshotPlaceholder() {
        // TM PR-D Part 3 — 코드만 공급 + 사업자명 미공급 시 snapshot=[partnerCode] placeholder.
        String csv = "거래처코드,이카운트 사업자명,생성 일시\n"
                + "P-2026-0010,,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByCodeForLookup("P-2026-0010"))
                .thenReturn(Optional.of(stub("P-2026-0010", "코드전용거래처")));
        when(blockService.isBlocked("P-2026-0010")).thenReturn(false);

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, true), "admin-1");

        assertThat(result.imported()).isEqualTo(1);
        verify(blockService).block(eq("P-2026-0010"), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), eq("[P-2026-0010]"));
    }

    @Test
    void importCsv_partnerCodeAndNameBothMiss_rejects() {
        // TM PR-D Part 3 — 코드/사업자명 둘 다 매칭 실패해도 legacy alias 로 보존.
        String csv = "거래처코드,이카운트 사업자명,생성 일시\n"
                + "P-MISS,미등록상호,2026년 4월 26일 오전 7:36\n";
        when(partnerService.findByCodeForLookup("P-MISS")).thenReturn(Optional.empty());
        when(partnerService.findByNameForLookup("미등록상호")).thenReturn(Optional.empty());

        BlockedPartnerImportResult result = service.importCsv(csvStream(csv, true), "admin-1");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        verify(blockService).blockLegacySnapshot(anyString(), any(), any(LocalDateTime.class),
                eq("NOTION_IMPORT"), eq("미등록상호"));
    }
}
