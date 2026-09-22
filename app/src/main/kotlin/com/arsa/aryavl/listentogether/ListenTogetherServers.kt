/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.listentogether

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class ListenTogetherServer(
    val name: String,
    val url: String,
    val location: String,
    val operator: String
)

object ListenTogetherServers {
    private const val ServersJson = """
        [
          {
            "name": "Sync Server",
            "url": "wss://vivimusic-listen-together.onrender.com",
            "location": "Global",
            "operator": "Arsa"
          },
          {
            "name": "Sync Server (Edge)",
            "url": "wss://convx-sync.cosmictaser-dev.workers.dev",
            "location": "Global (edge)",
            "operator": "Arsa"
          },
          {
            "name": "Sync Server (Alt)",
            "url": "wss://devilmi-vivi-music-listen-together.hf.space",
            "location": "Global",
            "operator": "Arsa"
          }
        ]
    """

    private val json = Json { ignoreUnknownKeys = true }

    val servers: List<ListenTogetherServer> by lazy {
        json.decodeFromString(ServersJson)
    }

    val defaultServerUrl: String
        get() = servers.first().url

    fun findByUrl(url: String): ListenTogetherServer? = servers.firstOrNull { it.url == url }
}
