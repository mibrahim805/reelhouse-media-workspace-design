package com.reelhouse.downloader.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = Coral60,
    onPrimary = OnSurface,
    primaryContainer = Coral20,
    onPrimaryContainer = Coral80,
    secondary = Coral40,
    onSecondary = OnSurface,
    secondaryContainer = SurfaceContainerHigh,
    onSecondaryContainer = OnSurface,
    tertiary = Info,
    onTertiary = OnSurface,
    background = Background,
    onBackground = OnSurface,
    surface = Surface,
    onSurface = OnSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    surfaceContainerHigh = SurfaceContainerHigh,
    surfaceContainer = SurfaceContainer,
    error = Error,
    onError = OnSurface,
    errorContainer = ErrorContainer,
    onErrorContainer = Error,
    outline = Outline,
    outlineVariant = OutlineVariant,
)

@Composable
fun ReelhouseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content,
    )
}
