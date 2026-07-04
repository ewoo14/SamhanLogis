package com.samhanair.logis.accounting.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DocumentNumberPathResolverTest {

    @Test
    void convertsMinimumDateSlug() {
        assertThat(DocumentNumberPathResolver.toSlashDocumentNo("2026-07-05-1"))
                .isEqualTo("2026/07/05-1");
    }

    @Test
    void keepsSlashDocumentNumberAsIs() {
        assertThat(DocumentNumberPathResolver.toSlashDocumentNo("2026/07/05-1"))
                .isEqualTo("2026/07/05-1");
    }

    @Test
    void keepsMalformedDateLikeValueAsIs() {
        assertThat(DocumentNumberPathResolver.toSlashDocumentNo("202A-07-05-1"))
                .isEqualTo("202A-07-05-1");
        assertThat(DocumentNumberPathResolver.toSlashDocumentNo("2026-7A-05-1"))
                .isEqualTo("2026-7A-05-1");
        assertThat(DocumentNumberPathResolver.toSlashDocumentNo("2026-07"))
                .isEqualTo("2026-07");
    }

    @Test
    void keepsNonDateBusinessIdentifierAsIs() {
        assertThat(DocumentNumberPathResolver.toSlashDocumentNo("ABCD-12-34-XYZ"))
                .isEqualTo("ABCD-12-34-XYZ");
    }

    @Test
    void keepsUuidBoundaryValueAsIs() {
        String uuid = "00000000-0000-0000-0000-000000000001";

        assertThat(DocumentNumberPathResolver.toSlashDocumentNo(uuid)).isEqualTo(uuid);
    }
}
