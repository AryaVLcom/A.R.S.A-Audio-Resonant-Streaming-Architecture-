/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.ui.screens.artist

import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.activity.compose.BackHandler
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.ExperimentalFoundationApi
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.Box
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.Row
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.Spacer
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.padding
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.lazy.grid.GridCells
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.lazy.grid.GridItemSpan
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.lazy.grid.items
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.ExperimentalMaterial3Api
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.Icon
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.MaterialTheme
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.SnackbarHost
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.SnackbarHostState
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.Text
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.TopAppBar
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.TopAppBarScrollBehavior
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.Composable
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.collectAsState
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.getValue
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.mutableStateListOf
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.mutableStateOf
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.remember
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.rememberCoroutineScope
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.saveable.listSaver
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.saveable.rememberSaveable
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.setValue
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.toMutableStateList
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.Alignment
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.Modifier
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.res.painterResource
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.res.pluralStringResource
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.unit.dp
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.navigation.NavController
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.LocalPlayerAwareWindowInsets
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.LocalPlayerConnection
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.R
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.utils.rememberGridColumns
import com.arsa.aryavl.constants.CONTENT_TYPE_ALBUM
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.constants.CONTENT_TYPE_HEADER
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.constants.GridItemSize
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.constants.GridItemsSizeKey
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.constants.GridThumbnailHeight
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.component.ListScrollRail
import com.arsa.aryavl.ui.component.IconButton
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.component.LibraryAlbumGridItem
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.component.LocalMenuState
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.utils.backToMain
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.utils.rememberEnumPreference
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.viewmodels.ArtistAlbumsViewModel

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun ArtistAlbumsScreen(
    navController: NavController,
    scrollBehavior: TopAppBarScrollBehavior,
    viewModel: ArtistAlbumsViewModel = hiltViewModel(),
) {
    val menuState = LocalMenuState.current
    val playerConnection = LocalPlayerConnection.current ?: return
    val isPlaying by playerConnection.isEffectivelyPlaying.collectAsState()
    val mediaMetadata by playerConnection.mediaMetadata.collectAsState()

    val artist by viewModel.artist.collectAsState()
    val albums by viewModel.albums.collectAsState()

    val coroutineScope = rememberCoroutineScope()
    val lazyGridState = rememberLazyGridState()
    val gridItemSize by rememberEnumPreference(GridItemsSizeKey, GridItemSize.BIG)

    var inSelectMode by rememberSaveable { mutableStateOf(false) }
    val selection = rememberSaveable(
        saver = listSaver<MutableList<String>, String>(
            save = { it.toList() },
            restore = { it.toMutableStateList() }
        )
    ) { mutableStateListOf() }
    val onExitSelectionMode = {
        inSelectMode = false
        selection.clear()
    }
    if (inSelectMode) {
        BackHandler(onBack = onExitSelectionMode)
    }

    val snackbarHostState = remember { SnackbarHostState() }

    val visibleAlbums = remember(albums) { albums.distinctBy { it.id } }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        LazyVerticalGrid(
            state = lazyGridState,
            columns = rememberGridColumns(),
            contentPadding = LocalPlayerAwareWindowInsets.current.asPaddingValues()
        ) {
            item(
                key = "header",
                span = { GridItemSpan(maxLineSpan) },
                contentType = CONTENT_TYPE_HEADER
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 16.dp)
                ) {
                    Spacer(Modifier.weight(1f))

                    Text(
                        text = pluralStringResource(R.plurals.n_album, albums.size, albums.size),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }

            items(
                items = visibleAlbums,
                key = { it.id },
                contentType = { CONTENT_TYPE_ALBUM }
            ) { album ->
                LibraryAlbumGridItem(
                    navController = navController,
                    menuState = menuState,
                    coroutineScope = coroutineScope,
                    album = album,
                    isActive = album.id == mediaMetadata?.album?.id,
                    isPlaying = isPlaying,
                    modifier = Modifier.animateItem()
                )
            }
        }

        // No sort control on this screen -- albums arrive in release order -- so the rail
        // is a proportional thumb rather than letters.
        ListScrollRail(
            lazyGridState = lazyGridState,
            itemCount = visibleAlbums.size,
            sectionIndexMap = null,
        )

        TopAppBar(
            windowInsets = appTopBarWindowInsets(),
            title = { Text(artist?.artist?.name.orEmpty()) },
            navigationIcon = {
                IconButton(
                    onClick = navController::navigateUp,
                    onLongClick = navController::backToMain
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.arrow_back),
                        contentDescription = null
                    )
                }
            },
            scrollBehavior = scrollBehavior
        )

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .windowInsetsPadding(LocalPlayerAwareWindowInsets.current)
                .align(Alignment.BottomCenter)
        )
    }
}
