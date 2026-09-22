/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.utils

import android.content.Context
import android.content.Intent
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ShareHelper {
    private const val BASE_SHARE_URL = "https://listen.aryavl.com"
    private const val SNAPSHOT_API_URL = "https://listen.aryavl.com/api/snapshot"

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    data class SnapshotData(
        val snapshotId: String,
        val title: String,
        val trackIds: List<String>
    )

    /**
     * Builds standard listen.aryavl.com track URL
     */
    fun trackUrl(trackId: String): String = "$BASE_SHARE_URL/$trackId"

    /**
     * Builds standard listen.aryavl.com playlist URL
     */
    fun playlistUrl(playlistId: String): String = "$BASE_SHARE_URL/playlist/$playlistId"

    /**
     * Shares a track using Android OS share sheet
     */
    fun shareTrack(context: Context, trackId: String) {
        val url = trackUrl(trackId)
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        val chooser = Intent.createChooser(sendIntent, null).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    /**
     * Shares a playlist. If it's a private or local playlist, creates a server-side
     * snapshot on the backend first and shares the snapshot link.
     */
    fun sharePlaylist(
        context: Context,
        playlistId: String?,
        isPrivateOrLocal: Boolean,
        title: String?,
        trackIds: List<String>,
        coroutineScope: CoroutineScope
    ) {
        // If public/unlisted YouTube playlist, share directly
        if (!isPrivateOrLocal && !playlistId.isNullOrBlank()) {
            val url = playlistUrl(playlistId)
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, url)
            }
            context.startActivity(Intent.createChooser(sendIntent, null).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            return
        }

        // Private / local playlist: snapshot track list to backend
        coroutineScope.launch(Dispatchers.IO) {
            val snapshotId = createSnapshotOnBackend(title, trackIds)
            withContext(Dispatchers.Main) {
                if (!snapshotId.isNullOrBlank()) {
                    val url = playlistUrl(snapshotId)
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, url)
                    }
                    context.startActivity(Intent.createChooser(sendIntent, null).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    })
                } else {
                    // Fallback to plain URL if playlistId exists, or show notice
                    if (!playlistId.isNullOrBlank()) {
                        val url = playlistUrl(playlistId)
                        val sendIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, url)
                        }
                        context.startActivity(Intent.createChooser(sendIntent, null).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        })
                    } else {
                        Toast.makeText(context, "Unable to create share link", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    /**
     * Uploads track list snapshot to MongoDB backend
     */
    private suspend fun createSnapshotOnBackend(title: String?, trackIds: List<String>): String? =
        withContext(Dispatchers.IO) {
            try {
                if (trackIds.isEmpty()) return@withContext null
                val json = JSONObject().apply {
                    put("title", title ?: "Shared Playlist")
                    put("trackIds", JSONArray(trackIds))
                }
                val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                val request = Request.Builder()
                    .url(SNAPSHOT_API_URL)
                    .post(body)
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val respStr = response.body?.string() ?: return@withContext null
                    val respJson = JSONObject(respStr)
                    respJson.optString("snapshotId").ifBlank { null }
                }
            } catch (e: Exception) {
                reportException(e)
                null
            }
        }

    /**
     * Resolves a snapshot from MongoDB backend given a snapshotId
     */
    suspend fun resolveSnapshot(snapshotId: String): SnapshotData? =
        withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("$SNAPSHOT_API_URL/$snapshotId")
                    .get()
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val respStr = response.body?.string() ?: return@withContext null
                    val json = JSONObject(respStr)
                    val id = json.getString("snapshotId")
                    val title = json.optString("title", "Shared Playlist")
                    val arr = json.optJSONArray("trackIds") ?: JSONArray()
                    val trackIds = mutableListOf<String>()
                    for (i in 0 until arr.length()) {
                        trackIds.add(arr.getString(i))
                    }
                    SnapshotData(
                        snapshotId = id,
                        title = title,
                        trackIds = trackIds
                    )
                }
            } catch (e: Exception) {
                reportException(e)
                null
            }
        }
}
