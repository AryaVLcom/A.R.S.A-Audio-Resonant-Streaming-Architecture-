/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.lyrics

import android.content.Context
import android.util.LruCache
import com.arsa.aryavl.constants.LyricsProviderOrderKey
import com.arsa.aryavl.constants.PreferredLyricsProvider
import com.arsa.aryavl.constants.PreferredLyricsProviderKey
import com.arsa.aryavl.db.entities.LyricsEntity.Companion.LYRICS_NOT_FOUND
import com.arsa.aryavl.extensions.toEnum
import com.arsa.aryavl.models.MediaMetadata
import com.arsa.aryavl.utils.NetworkConnectivityObserver
import com.arsa.aryavl.utils.dataStore
import com.arsa.aryavl.utils.reportException
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

class LyricsHelper
@Inject
constructor(
    @ApplicationContext private val context: Context,
    private val networkConnectivity: NetworkConnectivityObserver,
) {
    /**
     * Resolves the ordered list of lyrics providers from the user's saved priority order.
     * Falls back to migrating the legacy [PreferredLyricsProvider] enum if the new order
     * preference has not been written yet, ensuring a smooth upgrade for existing users.
     */
    private suspend fun resolveLyricsProviders(): List<LyricsProvider> {
        val preferences = context.dataStore.data.first()
        val orderString = preferences[LyricsProviderOrderKey].orEmpty()

        if (orderString.isNotBlank()) {
            return LyricsProviderRegistry.getOrderedProviders(orderString)
        }

        // Migration path: place the old preferred provider first in the default order
        val preferredEnum = preferences[PreferredLyricsProviderKey]
            .toEnum(PreferredLyricsProvider.YOULYPLUS)
        val preferredName = LyricsProviderRegistry.getProviderNameForEnum(preferredEnum)
        val defaultOrder = LyricsProviderRegistry.getDefaultProviderOrder()
        val migratedOrder = listOf(preferredName) + defaultOrder.filter { it != preferredName }
        return migratedOrder.mapNotNull { LyricsProviderRegistry.getProviderByName(it) }
    }



    private val cache = LruCache<String, List<LyricsResult>>(MAX_CACHE_SIZE)
    private var currentLyricsJob: Job? = null

    suspend fun getLyrics(mediaMetadata: MediaMetadata): LyricsWithProvider {
        currentLyricsJob?.cancel()

        val cached = cache.get(mediaMetadata.id)?.firstOrNull()
        if (cached != null) {
            return LyricsWithProvider(cached.lyrics, cached.providerName)
        }

        // Check network connectivity before making network requests
        // Use synchronous check as fallback if flow doesn't emit
        val isNetworkAvailable = try {
            networkConnectivity.isCurrentlyConnected()
        } catch (e: Exception) {
            // If network check fails, try to proceed anyway
            true
        }
        
        if (!isNetworkAvailable) {
            // Still proceed but return not found to avoid hanging
            return LyricsWithProvider(LYRICS_NOT_FOUND, "Unknown")
        }

        val providers = resolveLyricsProviders()
        val scope = CoroutineScope(SupervisorJob())
        val deferreds = providers.filter { it.isEnabled(context) }.map { provider ->
            scope.async {
                try {
                    val result = provider.getLyrics(
                        mediaMetadata.id,
                        mediaMetadata.title,
                        mediaMetadata.artists.joinToString { it.name },
                        mediaMetadata.duration,
                        mediaMetadata.album?.title,
                    )
                    result.getOrNull()?.let { LyricsWithProvider(it, provider.name) }
                } catch (e: Exception) {
                    reportException(e)
                    null
                }
            }
        }

        for (deferred in deferreds) {
            val res = deferred.await()
            if (res != null) {
                scope.cancel()
                return res
            }
        }
        
        scope.cancel()
        return LyricsWithProvider(LYRICS_NOT_FOUND, "Unknown")
    }

    suspend fun getAllLyrics(
        mediaId: String,
        songTitle: String,
        songArtists: String,
        duration: Int,
        album: String? = null,
        callback: (LyricsResult) -> Unit,
    ) {
        currentLyricsJob?.cancel()

        val cacheKey = "$songArtists-$songTitle".replace(" ", "")
        cache.get(cacheKey)?.let { results ->
            results.forEach {
                callback(it)
            }
            return
        }

        // Check network connectivity before making network requests
        // Use synchronous check as fallback if flow doesn't emit
        val isNetworkAvailable = try {
            networkConnectivity.isCurrentlyConnected()
        } catch (e: Exception) {
            // If network check fails, try to proceed anyway
            true
        }
        
        if (!isNetworkAvailable) {
            // Still try to proceed in case of false negative
            return
        }

        val allResult = mutableListOf<LyricsResult>()
        val providers = resolveLyricsProviders()
        val scope = CoroutineScope(SupervisorJob())
        currentLyricsJob = scope.launch {
            val jobs = providers.map { provider ->
                launch {
                    if (provider.isEnabled(context)) {
                        try {
                            provider.getAllLyrics(mediaId, songTitle, songArtists, duration, album) { lyrics ->
                                val result = LyricsResult(provider.name, lyrics)
                                synchronized(allResult) {
                                    allResult += result
                                }
                                callback(result)
                            }
                        } catch (e: Exception) {
                            reportException(e)
                        }
                    }
                }
            }
            jobs.forEach { it.join() }
            cache.put(cacheKey, allResult)
        }

        currentLyricsJob?.join()
    }

    fun cancelCurrentLyricsJob() {
        currentLyricsJob?.cancel()
        currentLyricsJob = null
    }

    companion object {
        private const val MAX_CACHE_SIZE = 3
    }
}

data class LyricsResult(
    val providerName: String,
    val lyrics: String,
)

data class LyricsWithProvider(
    val lyrics: String,
    val provider: String,
)