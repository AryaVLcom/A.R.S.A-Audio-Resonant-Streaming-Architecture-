/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.ui.screens.wrapped

import com.music.innertube.models.AccountInfo
import com.arsa.aryavl.db.entities.Album
import com.arsa.aryavl.db.entities.Artist
import com.arsa.aryavl.db.entities.SongWithStats

data class WrappedState(
    val accountInfo: AccountInfo? = null,
    val totalMinutes: Long = 0,
    val topSongs: List<SongWithStats> = emptyList(),
    val topArtists: List<Artist> = emptyList(),
    val top5Albums: List<Album> = emptyList(),
    val topAlbum: Album? = null,
    val uniqueSongCount: Int = 0,
    val uniqueArtistCount: Int = 0,
    val totalAlbums: Int = 0,
    val isDataReady: Boolean = false,
    val trackMap: Map<WrappedScreenType, String?> = emptyMap(),
    val playlistCreationState: PlaylistCreationState = PlaylistCreationState.Idle
)
