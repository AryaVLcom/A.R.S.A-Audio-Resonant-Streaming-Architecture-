/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.ui.screens

import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.navigation.NavController
import com.arsa.aryavl.LocalPlayerAwareWindowInsets
import com.arsa.aryavl.LocalPlayerConnection
import com.arsa.aryavl.R
import com.arsa.aryavl.ui.utils.rememberGridColumns
import com.arsa.aryavl.constants.GridItemSize
import com.arsa.aryavl.constants.GridItemsSizeKey
import com.arsa.aryavl.constants.GridThumbnailHeight
import com.arsa.aryavl.constants.MiniPlayerBottomSpacing
import com.arsa.aryavl.constants.MiniPlayerHeight
import com.arsa.aryavl.constants.NavigationBarHeight
import com.arsa.aryavl.ui.component.LargeScreenTitle
import com.arsa.aryavl.ui.component.GlassCircleButton
import com.arsa.aryavl.ui.component.HeroBackground
import com.arsa.aryavl.ui.utils.rememberHeroZoom
import com.arsa.aryavl.ui.utils.heroPullZoom
import com.arsa.aryavl.ui.utils.listOverscroll
import com.arsa.aryavl.ui.component.GlassComponent
import com.arsa.aryavl.ui.component.LocalGlassEffectConfig
import com.arsa.aryavl.ui.component.LocalMenuState
import com.arsa.aryavl.ui.component.backdrop.backdrops.rememberLayerBackdrop
import com.arsa.aryavl.ui.component.isGlassAllowed
import com.arsa.aryavl.ui.component.liquidGlass
import com.arsa.aryavl.ui.component.rememberHeroSource
import com.arsa.aryavl.ui.component.rememberHeroTint
import com.arsa.aryavl.ui.component.shapes.ContinuousRoundedRectangle
import com.arsa.aryavl.ui.component.shimmer.GridItemPlaceHolder
import com.arsa.aryavl.ui.component.shimmer.ShimmerHost
import com.arsa.aryavl.ui.component.YouTubeGridItem
import com.arsa.aryavl.ui.menu.YouTubeAlbumMenu
import com.arsa.aryavl.ui.theme.AppleTokens
import com.arsa.aryavl.ui.theme.HeroTintedContent
import com.arsa.aryavl.ui.utils.backToMain
import com.arsa.aryavl.ui.utils.combinedBounceClick
import com.arsa.aryavl.utils.rememberEnumPreference
import com.arsa.aryavl.viewmodels.NewReleaseViewModel

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun NewReleaseScreen(
    navController: NavController,
    scrollBehavior: TopAppBarScrollBehavior,
    viewModel: NewReleaseViewModel = hiltViewModel(),
) {
    val menuState = LocalMenuState.current
    val haptic = LocalHapticFeedback.current
    val playerConnection = LocalPlayerConnection.current ?: return
    val isPlaying by playerConnection.isEffectivelyPlaying.collectAsState()
    val mediaMetadata by playerConnection.mediaMetadata.collectAsState()

    val newReleaseAlbums by viewModel.newReleaseAlbums.collectAsState()

    val coroutineScope = rememberCoroutineScope()
    val gridItemSize by rememberEnumPreference(GridItemsSizeKey, GridItemSize.BIG)

    val heroUrl = newReleaseAlbums.firstOrNull()?.thumbnail
    val heroSource = rememberHeroSource(
        staticArt = heroUrl,
        songs = emptyList()
    )
    val tint = rememberHeroTint(heroUrl)
    val onTint = AppleTokens.onColor(tint)

    val glassConfig = LocalGlassEffectConfig.current
    val useGlass = glassConfig.isEnabledFor(GlassComponent.NAV_BAR) && isGlassAllowed()
    val heroBackdrop = rememberLayerBackdrop()

    val heroZoom = rememberHeroZoom()

    HeroBackground(
        tint = tint,
        heroSource = heroSource,
        heroScale = heroZoom.scale,
        modifier = Modifier.fillMaxSize(),
    ) {
      HeroTintedContent(tint = tint, backdrop = heroBackdrop) {
        val chromeShape = ContinuousRoundedRectangle(percent = 50)
        
        Box(modifier = Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                // No bounce here: the top pull drives the hero zoom instead.
                overscrollEffect = heroZoom.listOverscroll(),
                modifier = Modifier.heroPullZoom(heroZoom).fillMaxSize(),
                columns = rememberGridColumns(),
                contentPadding = LocalPlayerAwareWindowInsets.current.asPaddingValues(),
            ) {
                item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                    Column {
                        LargeScreenTitle(
                            title = stringResource(R.string.new_release_albums),
                            color = onTint,
                        )
                    }
                }

                items(
                    items = newReleaseAlbums.distinctBy { it.id },
                    key = { it.id },
                ) { album ->
                    YouTubeGridItem(
                        item = album,
                        isActive = mediaMetadata?.album?.id == album.id,
                        isPlaying = isPlaying,
                        fillMaxWidth = true,
                        coroutineScope = coroutineScope,
                        modifier =
                        Modifier
                            .combinedBounceClick(
                                onClick = {
                                    navController.navigate("album/${album.id}")
                                },
                                onLongClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    menuState.show {
                                        YouTubeAlbumMenu(
                                            albumItem = album,
                                            navController = navController,
                                            onDismiss = menuState::dismiss,
                                        )
                                    }
                                },
                            ),
                    )
                }

                if (newReleaseAlbums.isEmpty()) {
                    items(8) {
                        ShimmerHost {
                            GridItemPlaceHolder(fillMaxWidth = true)
                        }
                    }
                }

                item(span = { GridItemSpan(maxLineSpan) }) {
                    Spacer(Modifier.height(MiniPlayerHeight + MiniPlayerBottomSpacing + NavigationBarHeight + 50.dp))
                }
            }

            // Top bar logic
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .windowInsetsPadding(appTopBarWindowInsets())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlassCircleButton(
                    onClick = { navController.navigateUp() },
                    onLongClick = { navController.backToMain() },
                ) {
                    Icon(
                        painter = painterResource(R.drawable.arrow_back),
                        contentDescription = null,
                    )
                }

                Spacer(Modifier.weight(1f))
            }
        }
      }
    }
}
