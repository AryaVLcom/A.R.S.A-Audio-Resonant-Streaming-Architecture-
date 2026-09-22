/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.lyrics

import android.content.Context
import com.music.youlyplus.YouLyPlus
import com.arsa.aryavl.constants.EnableYouLyPlusKey
import com.arsa.aryavl.utils.dataStore
import com.arsa.aryavl.utils.get

object YouLyPlusLyricsProvider : LyricsProvider {
    override val name = "YouLyPlus"

    override fun isEnabled(context: Context): Boolean =
        context.dataStore[EnableYouLyPlusKey] ?: true

    override suspend fun getLyrics(
        id: String,
        title: String,
        artist: String,
        duration: Int,
        album: String?,
    ): Result<String> = YouLyPlus.getLyrics(title, artist, duration, album, id)

    override suspend fun getAllLyrics(
        id: String,
        title: String,
        artist: String,
        duration: Int,
        album: String?,
        callback: (String) -> Unit,
    ) {
        YouLyPlus.getAllLyrics(title, artist, duration, album, id, null, callback)
    }
}

