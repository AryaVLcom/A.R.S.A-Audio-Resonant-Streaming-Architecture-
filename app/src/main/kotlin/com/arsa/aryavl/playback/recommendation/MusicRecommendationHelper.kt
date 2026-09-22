/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.playback.recommendation

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import coil3.imageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.arsa.aryavl.MainActivity
import com.arsa.aryavl.R
import com.music.innertube.YouTube
import com.music.innertube.models.SongItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.util.concurrent.TimeUnit

object MusicRecommendationHelper {
    const val CHANNEL_ID = "music_recommendations"
    const val NOTIFICATION_ID = 2002
    private const val WORK_NAME = "MusicRecommendationWorker"
    private const val PREFS_NAME = "music_recommendation_prefs"
    private const val KEY_ENABLED = "song_suggestions_enabled"
    private const val KEY_LAST_SONG_ID = "last_suggested_song_id"
    private const val KEY_LAST_TIMESTAMP = "last_suggested_timestamp"

    private val SPOTIFY_STYLE_TITLES = listOf(
        "Recommended for you ✨",
        "Discover something new 🎧",
        "Trending on YouTube Music 🔥",
        "Songs you might love 🎶",
        "Music picked for you 🎵"
    )

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.song_suggestions_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = context.getString(R.string.song_suggestions_channel_desc)
                setShowBadge(true)
            }
            nm?.createNotificationChannel(channel)
        }
    }

    fun getSongSuggestionsEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_ENABLED, true)
    }

    fun setSongSuggestionsEnabled(context: Context, enabled: Boolean) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
        if (enabled) {
            setupPeriodicWorker(context)
        } else {
            cancelPeriodicWorker(context)
        }
    }

    fun setupPeriodicWorker(context: Context) {
        if (!getSongSuggestionsEnabled(context)) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicWork = PeriodicWorkRequestBuilder<MusicRecommendationWorker>(
            24, TimeUnit.HOURS,
            6, TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicWork
        )
        Timber.tag("MusicRecommendation").d("Enqueued periodic recommendation worker (24h)")
    }

    fun cancelPeriodicWorker(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        Timber.tag("MusicRecommendation").d("Cancelled periodic recommendation worker")
    }

    suspend fun sendRecommendation(context: Context, isTest: Boolean = false): Boolean = withContext(Dispatchers.IO) {
        if (!isTest && !getSongSuggestionsEnabled(context)) {
            Timber.tag("MusicRecommendation").d("Suggestions disabled in settings; skipping")
            return@withContext false
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPerm = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!hasPerm) {
                Timber.tag("MusicRecommendation").w("POST_NOTIFICATIONS permission not granted")
                return@withContext false
            }
        }

        createNotificationChannel(context)

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastSongId = prefs.getString(KEY_LAST_SONG_ID, null)

        // 1. Fetch recommendations from YouTube Music home feed
        val homeResult = YouTube.home()
        val homeSections = homeResult.getOrNull()?.sections.orEmpty()
        val candidateSongs = homeSections
            .flatMap { it.items }
            .filterIsInstance<SongItem>()
            .filter { it.id.isNotBlank() }

        val pool = if (candidateSongs.size > 1 && !lastSongId.isNullOrBlank()) {
            candidateSongs.filter { it.id != lastSongId }
        } else {
            candidateSongs
        }

        val selectedSong: SongItem? = pool.shuffled().firstOrNull()

        if (selectedSong == null) {
            Timber.tag("MusicRecommendation").w("No recommended songs could be fetched from YouTube Music")
            return@withContext false
        }

        // 2. Fetch thumbnail bitmap with hardware disabled
        val thumbnailBitmap: Bitmap? = selectedSong.thumbnail?.let { url ->
            try {
                val request = ImageRequest.Builder(context)
                    .data(url)
                    .allowHardware(false)
                    .build()
                val result = context.imageLoader.execute(request)
                (result as? SuccessResult)?.image?.toBitmap()
            } catch (e: Exception) {
                Timber.tag("MusicRecommendation").w(e, "Failed to load song thumbnail for notification")
                null
            }
        }

        // 3. Build Intent to open and play the track in ARSA
        val listenUri = "https://listen.aryavl.com/${selectedSong.id}".toUri()
        val openIntent = Intent(context, MainActivity::class.java).apply {
            data = listenUri
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPending = PendingIntent.getActivity(
            context,
            selectedSong.id.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playActionIntent = Intent(context, MainActivity::class.java).apply {
            data = listenUri
            action = Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val playPending = PendingIntent.getActivity(
            context,
            (selectedSong.id + "_play").hashCode(),
            playActionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = SPOTIFY_STYLE_TITLES.random()
        val artistNames = selectedSong.artists.joinToString { it.name }.ifBlank {
            context.getString(R.string.unknown_artist)
        }
        val contentText = "${selectedSong.title} • $artistNames"

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.arsa_notification)
            .setContentTitle(title)
            .setContentText(contentText)
            .setSubText(context.getString(R.string.app_name))
            .setContentIntent(contentPending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .addAction(R.drawable.play, context.getString(R.string.play), playPending)

        if (thumbnailBitmap != null) {
            builder.setLargeIcon(thumbnailBitmap)
            builder.setStyle(
                NotificationCompat.BigPictureStyle()
                    .bigPicture(thumbnailBitmap)
                    .setBigContentTitle(title)
                    .setSummaryText(contentText)
            )
        }

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
        Timber.tag("MusicRecommendation").d("Posted music recommendation notification for: ${selectedSong.title}")

        // Save last suggested song id and timestamp
        prefs.edit()
            .putString(KEY_LAST_SONG_ID, selectedSong.id)
            .putLong(KEY_LAST_TIMESTAMP, System.currentTimeMillis())
            .apply()

        true
    }
}
