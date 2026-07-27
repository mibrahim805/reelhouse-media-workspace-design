package com.reelhouse.downloader.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.reelhouse.downloader.MainActivity
import com.reelhouse.downloader.R

/**
 * Builds and manages download notifications.
 */
class DownloadNotification(private val context: Context) {

    companion object {
        const val CHANNEL_ID = "reelhouse_downloads"
        const val SERVICE_NOTIFICATION_ID = 1001
        const val COMPLETE_NOTIFICATION_BASE_ID = 2000

        fun progressId(downloadId: String): Int =
            10_000 + (downloadId.hashCode() and 0x0fffffff) % 100_000
    }

    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.notification_channel_description)
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun buildProgressNotification(
        title: String,
        progress: Int,
        speed: String,
        cancelIntent: PendingIntent,
    ): Notification {
        val contentText = if (speed.isNotBlank()) {
            "$progress% · $speed"
        } else {
            "$progress%"
        }

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, progress, progress == 0)
            .setContentIntent(createMainIntent())
            .addAction(
                R.drawable.ic_notification,
                context.getString(R.string.notification_cancel_action),
                cancelIntent,
            )
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    fun buildServiceNotification(jobCount: Int): Notification {
        val label = if (jobCount == 1) "1 download active or queued"
            else "$jobCount downloads active or queued"
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("Reelhouse downloads")
            .setContentText(label)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(0, 0, true)
            .setContentIntent(createMainIntent())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    fun updateServiceNotification(jobCount: Int) {
        notificationManager.notify(
            SERVICE_NOTIFICATION_ID,
            buildServiceNotification(jobCount),
        )
    }

    fun showProgressNotification(
        downloadId: String,
        title: String,
        progress: Int,
        speed: String,
        cancelIntent: PendingIntent,
    ) {
        notificationManager.notify(
            progressId(downloadId),
            buildProgressNotification(title, progress, speed, cancelIntent),
        )
    }

    fun buildProcessingNotification(title: String): Notification {
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(context.getString(R.string.downloads_processing))
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(0, 0, true)
            .setContentIntent(createMainIntent())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    fun showCompleteNotification(title: String, notificationId: Int) {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(context.getString(R.string.notification_complete))
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(true)
            .setContentIntent(createMainIntent())
            .build()

        notificationManager.notify(notificationId, notification)
    }

    fun showFailedNotification(title: String, errorMessage: String, notificationId: Int) {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(errorMessage)
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(true)
            .setContentIntent(createMainIntent())
            .build()

        notificationManager.notify(notificationId, notification)
    }

    fun cancelNotification(id: Int) {
        notificationManager.cancel(id)
    }

    private fun createMainIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
