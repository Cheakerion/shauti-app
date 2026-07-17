package com.shuati.app

import android.app.Application

class ShuatiApplication : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}
