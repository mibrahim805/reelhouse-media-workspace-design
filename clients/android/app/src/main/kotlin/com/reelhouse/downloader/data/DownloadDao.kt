package com.reelhouse.downloader.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {

    @Query("SELECT * FROM downloads ORDER BY createdAt DESC")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'processing') ORDER BY createdAt ASC")
    fun getActiveDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status IN ('complete', 'failed', 'cancelled') ORDER BY completedAt DESC, createdAt DESC")
    fun getCompletedDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status = 'complete' ORDER BY completedAt DESC LIMIT :limit")
    fun getRecentCompleted(limit: Int = 5): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :id")
    suspend fun getById(id: String): DownloadEntity?

    @Query("SELECT * FROM downloads WHERE id = :id")
    fun getByIdFlow(id: String): Flow<DownloadEntity?>

    @Query("SELECT * FROM downloads WHERE url = :url AND status IN ('queued', 'downloading', 'processing') LIMIT 1")
    suspend fun findActiveByUrl(url: String): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(download: DownloadEntity)

    @Update
    suspend fun update(download: DownloadEntity)

    @Query("UPDATE downloads SET status = :status, progress = :progress, downloadedBytes = CASE WHEN :downloaded > 0 THEN :downloaded ELSE downloadedBytes END, totalBytes = CASE WHEN :total > 0 THEN :total ELSE totalBytes END, speedBytesPerSec = :speed, etaSeconds = :eta WHERE id = :id")
    suspend fun updateProgress(
        id: String,
        status: String,
        progress: Float,
        downloaded: Long,
        total: Long,
        speed: Long,
        eta: Long,
    )

    @Query("UPDATE downloads SET status = :status, errorMessage = :error, errorType = :errorType, completedAt = :completedAt WHERE id = :id")
    suspend fun updateStatus(
        id: String,
        status: String,
        error: String? = null,
        errorType: String? = null,
        completedAt: Long? = null,
    )

    @Query("UPDATE downloads SET status = 'complete', progress = 1.0, contentUri = :contentUri, fileSizeBytes = :fileSize, savedDisplayName = :displayName, savedLocation = :savedLocation, completedAt = :completedAt WHERE id = :id")
    suspend fun markComplete(
        id: String,
        contentUri: String,
        fileSize: Long,
        displayName: String,
        savedLocation: String,
        completedAt: Long = System.currentTimeMillis(),
    )

    @Delete
    suspend fun delete(download: DownloadEntity)

    @Query("DELETE FROM downloads WHERE status IN ('complete', 'failed', 'cancelled')")
    suspend fun clearHistory()

    @Query("SELECT COUNT(*) FROM downloads WHERE status IN ('queued', 'downloading', 'processing')")
    suspend fun activeCount(): Int

    @Query("UPDATE downloads SET status = 'failed', errorType = 'INTERRUPTED', errorMessage = 'Download was interrupted. Retry to start it again.', completedAt = :completedAt WHERE status IN ('queued', 'downloading', 'processing')")
    suspend fun markInterruptedDownloads(completedAt: Long = System.currentTimeMillis())
}
