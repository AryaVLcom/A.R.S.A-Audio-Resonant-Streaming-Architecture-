/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.playback.recommendation

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import timber.log.Timber

class MusicRecommendationWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        Timber.tag("MusicRecommendationWorker").d("MusicRecommendationWorker starting execution")
        return try {
            val sent = MusicRecommendationHelper.sendRecommendation(applicationContext, isTest = false)
            Timber.tag("MusicRecommendationWorker").d("MusicRecommendationWorker completed with sent = $sent")
            Result.success()
        } catch (e: Exception) {
            Timber.tag("MusicRecommendationWorker").e(e, "Error executing MusicRecommendationWorker")
            Result.retry()
        }
    }
}
