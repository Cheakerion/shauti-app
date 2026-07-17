package com.shuati.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.shuati.app.ui.home.HomeScreen
import com.shuati.app.ui.quiz.choice.ChoiceQuizScreen
import com.shuati.app.ui.quiz.fill.FillBlankQuizScreen
import com.shuati.app.ui.quiz.multi.MultiChoiceQuizScreen
import com.shuati.app.ui.quiz.text.TextQuizScreen
import com.shuati.app.ui.quiz.truefalse.TrueFalseQuizScreen

object Routes {
    const val HOME = "home"
    const val CHOICE = "choice/{bankId}"
    const val TRUE_FALSE = "truefalse/{bankId}"
    const val MULTI = "multi/{bankId}"
    const val TEXT = "text/{bankId}/{qType}"
    const val FILL = "fill/{bankId}"
}

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) { HomeScreen(navController) }

        composable(
            Routes.CHOICE,
            arguments = listOf(navArgument("bankId") { type = NavType.StringType }),
        ) { entry ->
            ChoiceQuizScreen(navController, entry.arguments?.getString("bankId").orEmpty())
        }

        composable(
            Routes.TRUE_FALSE,
            arguments = listOf(navArgument("bankId") { type = NavType.StringType }),
        ) { entry ->
            TrueFalseQuizScreen(navController, entry.arguments?.getString("bankId").orEmpty())
        }

        composable(
            Routes.MULTI,
            arguments = listOf(navArgument("bankId") { type = NavType.StringType }),
        ) { entry ->
            MultiChoiceQuizScreen(navController, entry.arguments?.getString("bankId").orEmpty())
        }

        composable(
            Routes.TEXT,
            arguments = listOf(
                navArgument("bankId") { type = NavType.StringType },
                navArgument("qType") { type = NavType.StringType },
            ),
        ) { entry ->
            TextQuizScreen(
                navController,
                entry.arguments?.getString("bankId").orEmpty(),
                entry.arguments?.getString("qType").orEmpty(),
            )
        }

        composable(
            Routes.FILL,
            arguments = listOf(navArgument("bankId") { type = NavType.StringType }),
        ) { entry ->
            FillBlankQuizScreen(navController, entry.arguments?.getString("bankId").orEmpty())
        }
    }
}
