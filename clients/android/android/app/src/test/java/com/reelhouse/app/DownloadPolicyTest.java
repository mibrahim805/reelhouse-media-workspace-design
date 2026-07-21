package com.reelhouse.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class DownloadPolicyTest {
    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void acceptsOnlyMediaFromConfiguredServer() {
        String server = "https://reelhouse.example";

        assertTrue(
            DownloadPolicy.isAllowedMediaDownload(
                "https://reelhouse.example/api/backend/media/video.mp4",
                server
            )
        );
        assertFalse(
            DownloadPolicy.isAllowedMediaDownload(
                "https://reelhouse.example.evil/api/backend/media/video.mp4",
                server
            )
        );
        assertFalse(
            DownloadPolicy.isAllowedMediaDownload(
                "https://reelhouse.example/api/backend/progress/job-id",
                server
            )
        );
    }

    @Test
    public void supportsServerPathAndDefaultHttpsPort() {
        assertTrue(
            DownloadPolicy.isAllowedMediaDownload(
                "https://reelhouse.example:443/app/api/backend/media/video.mp4",
                "https://reelhouse.example/app"
            )
        );
    }

    @Test
    public void resolvesRelativeMediaUrlsAgainstConfiguredServer() {
        assertEquals(
            "https://reelhouse.example/api/backend/media/My%20video.mp4",
            DownloadPolicy.resolveAllowedMediaDownload(
                "/api/backend/media/My%20video.mp4",
                "https://reelhouse.example",
                null,
                null
            )
        );
        assertEquals(
            "https://reelhouse.example/app/api/backend/media/video.mp4",
            DownloadPolicy.resolveAllowedMediaDownload(
                "api/backend/media/video.mp4",
                "https://reelhouse.example/app",
                null,
                null
            )
        );
    }

    @Test
    public void acceptsSameOriginMediaResponsesButNeverExternalOrigins() {
        assertEquals(
            "https://reelhouse.example/api/backend/files/job-id",
            DownloadPolicy.resolveAllowedMediaDownload(
                "https://reelhouse.example/api/backend/files/job-id",
                "https://reelhouse.example",
                "attachment; filename=video.mp4",
                "video/mp4"
            )
        );
        assertEquals(
            "https://reelhouse.example/api/backend/files/job-id",
            DownloadPolicy.resolveAllowedMediaDownload(
                "https://reelhouse.example/api/backend/files/job-id",
                "https://reelhouse.example",
                null,
                "video/mp4; charset=binary"
            )
        );
        assertNull(
            DownloadPolicy.resolveAllowedMediaDownload(
                "https://evil.example/video.mp4",
                "https://reelhouse.example",
                "attachment; filename=video.mp4",
                "video/mp4"
            )
        );
    }

    @Test
    public void rejectsSameOriginApiPagesWithoutDownloadMetadata() {
        assertNull(
            DownloadPolicy.resolveAllowedMediaDownload(
                "/api/backend/progress/job-id",
                "https://reelhouse.example",
                null,
                "application/json"
            )
        );
    }

    @Test
    public void sanitizesUnsafeFilenameCharacters() {
        assertEquals("bad_name_.mp4", DownloadPolicy.safeFilename("bad/name?.mp4"));
        assertEquals("video.mp4", DownloadPolicy.safeFilename("..."));
    }

    @Test
    public void keepsExistingDownloadAndChoosesNewFilename() throws Exception {
        File existing = temporaryFolder.newFile("video.mp4");
        assertTrue(existing.exists());

        assertEquals(
            "video (1).mp4",
            DownloadPolicy.uniqueFilename(temporaryFolder.getRoot(), "video.mp4")
        );
    }
}
