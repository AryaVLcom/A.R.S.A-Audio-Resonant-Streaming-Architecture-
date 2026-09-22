package com.arsa.aryavl.di

import android.content.Context
import com.arsa.aryavl.db.DatabaseDao
import com.arsa.aryavl.ui.screens.wrapped.WrappedAudioService
import com.arsa.aryavl.ui.screens.wrapped.WrappedManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object WrappedModule {
    @Provides
    @Singleton
    fun provideWrappedManager(
        databaseDao: DatabaseDao,
        @ApplicationContext context: Context,
    ): WrappedManager = WrappedManager(databaseDao, context)

    @Provides
    @Singleton
    fun provideWrappedAudioService(@ApplicationContext context: Context): WrappedAudioService = WrappedAudioService(context)
}
