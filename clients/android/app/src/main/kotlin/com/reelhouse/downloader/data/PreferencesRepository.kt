package com.reelhouse.downloader.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class PreferencesRepository(private val context: Context) {

    companion object {
        private val VIDEO_QUALITIES = setOf("best", "1080", "720", "480")
        private val AUDIO_QUALITIES = setOf("best", "128", "192", "256", "320")
        private val DOWNLOAD_TYPES = setOf("video", "audio")
        val DEFAULT_VIDEO_QUALITY = stringPreferencesKey("default_video_quality")
        val DEFAULT_AUDIO_QUALITY = stringPreferencesKey("default_audio_quality")
        val DEFAULT_DOWNLOAD_TYPE = stringPreferencesKey("default_download_type")
        val WIFI_ONLY = booleanPreferencesKey("wifi_only")
        val NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        val DOWNLOAD_DIRECTORY = stringPreferencesKey("download_directory")
    }

    val defaultVideoQuality: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[DEFAULT_VIDEO_QUALITY]?.takeIf { it in VIDEO_QUALITIES } ?: "best"
    }

    val defaultAudioQuality: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[DEFAULT_AUDIO_QUALITY]?.takeIf { it in AUDIO_QUALITIES } ?: "best"
    }

    val defaultDownloadType: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[DEFAULT_DOWNLOAD_TYPE]?.takeIf { it in DOWNLOAD_TYPES } ?: "video"
    }

    val wifiOnly: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[WIFI_ONLY] ?: false
    }

    val notificationsEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[NOTIFICATIONS_ENABLED] ?: true
    }

    val downloadDirectory: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[DOWNLOAD_DIRECTORY] ?: "downloads"
    }

    suspend fun setDefaultVideoQuality(quality: String) {
        require(quality in VIDEO_QUALITIES)
        context.dataStore.edit { it[DEFAULT_VIDEO_QUALITY] = quality }
    }

    suspend fun setDefaultAudioQuality(quality: String) {
        require(quality in AUDIO_QUALITIES)
        context.dataStore.edit { it[DEFAULT_AUDIO_QUALITY] = quality }
    }

    suspend fun setDefaultDownloadType(type: String) {
        require(type in DOWNLOAD_TYPES)
        context.dataStore.edit { it[DEFAULT_DOWNLOAD_TYPE] = type }
    }

    suspend fun setWifiOnly(enabled: Boolean) {
        context.dataStore.edit { it[WIFI_ONLY] = enabled }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.dataStore.edit { it[NOTIFICATIONS_ENABLED] = enabled }
    }

    suspend fun setDownloadDirectory(directory: String) {
        require(directory in setOf("downloads", "media"))
        context.dataStore.edit { it[DOWNLOAD_DIRECTORY] = directory }
    }
}
