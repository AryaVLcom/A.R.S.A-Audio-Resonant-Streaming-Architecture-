/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.lyrics

import android.content.Context
import com.arsa.aryavl.constants.EnableMusixmatchKey
import com.arsa.aryavl.musixmatch.MusixmatchClient
import com.arsa.aryavl.utils.dataStore
import com.arsa.aryavl.utils.get
import timber.log.Timber

object MusixmatchLyricsProvider : LyricsProvider {
    private const val TAG = "MusixmatchProvider"

    override val name = "Musixmatch"

    override fun isEnabled(context: Context): Boolean {
        // Also initializes the client lazily on first enable check
        val enabled = context.dataStore[EnableMusixmatchKey] ?: true
        if (enabled) {
            MusixmatchClient.init(context)
        }
        return enabled
    }

    override suspend fun getLyrics(
        id: String,
        title: String,
        artist: String,
        duration: Int,
        album: String?,
    ): Result<String> {
        Timber.tag(TAG).d("getLyrics: title='$title', artist='$artist', duration=$duration")
        return try {
            MusixmatchClient.getLyrics(title, artist, duration, album)
        } catch (e: Exception) {
            Timber.tag(TAG).e(e, "Exception in getLyrics")
            Result.failure(e)
        }
    }
}
