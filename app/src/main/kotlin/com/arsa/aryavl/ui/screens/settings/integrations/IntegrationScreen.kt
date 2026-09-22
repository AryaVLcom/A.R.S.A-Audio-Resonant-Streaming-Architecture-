/**
 * Arsa Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.arsa.aryavl.ui.screens.settings.integrations

import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.Column
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.padding
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.rememberScrollState
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.foundation.verticalScroll
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.ExperimentalMaterial3Api
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.Icon
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.Text
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.TopAppBar
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.material3.TopAppBarScrollBehavior
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.runtime.Composable
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.Modifier
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.res.painterResource
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.res.stringResource
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.compose.ui.unit.dp
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import androidx.navigation.NavController
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.LocalPlayerAwareWindowInsets
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.R
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.component.IconButton
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.component.IntegrationCard
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.component.IntegrationCardItem
import com.arsa.aryavl.ui.utils.appTopBarWindowInsets
import com.arsa.aryavl.ui.utils.backToMain

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegrationScreen(
    navController: NavController,
    scrollBehavior: TopAppBarScrollBehavior,
) {
    Column(
        Modifier
            .windowInsetsPadding(LocalPlayerAwareWindowInsets.current)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
    ) {
        IntegrationCard(
            title = stringResource(R.string.general),
            items = listOf(
                IntegrationCardItem(
                    icon = painterResource(R.drawable.discord),
                    title = { Text(stringResource(R.string.discord_integration)) },
                    onClick = {
                        navController.navigate("settings/integrations/discord")
                    }
                ),
                IntegrationCardItem(
                    icon = painterResource(R.drawable.music_note),
                    title = { Text(stringResource(R.string.lastfm_integration)) },
                    onClick = {
                        navController.navigate("settings/integrations/lastfm")
                    }
                )
            )
        )
    }

    TopAppBar(
            windowInsets = appTopBarWindowInsets(),
        title = { Text(stringResource(R.string.integrations)) },
        navigationIcon = {
            IconButton(
                onClick = navController::navigateUp,
                onLongClick = navController::backToMain,
            ) {
                Icon(
                    painterResource(R.drawable.arrow_back),
                    contentDescription = null,
                )
            }
        }
    )
}
