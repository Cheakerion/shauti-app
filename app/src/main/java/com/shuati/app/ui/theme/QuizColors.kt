package com.shuati.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * 刷题业务语义色：对/错/标记/解析框，深浅两组。
 * MaterialTheme 覆盖不到的旧版配色语义（选项绿底红底、解析浅蓝框、标记橙）经此下发。
 */
@Immutable
data class QuizColors(
    val correct: Color,             // 正确文字/描边
    val correctContainer: Color,    // 正确选项底色
    val wrong: Color,               // 错误文字/描边
    val wrongContainer: Color,      // 错误选项底色
    val marked: Color,              // 标记橙
    val explainContainer: Color,    // 解析框底色
)

val LightQuizColors = QuizColors(
    correct = Green600,
    correctContainer = Green100,
    wrong = Red600,
    wrongContainer = Red50,
    marked = Orange500,
    explainContainer = BlueExplain,
)

val DarkQuizColors = QuizColors(
    correct = Green400,
    correctContainer = Green900,
    wrong = Red400,
    wrongContainer = Red900,
    marked = Amber400,
    explainContainer = BlueExplainDark,
)

val LocalQuizColors = staticCompositionLocalOf { LightQuizColors }
