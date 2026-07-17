import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.shuati.app"
    compileSdk = 36
    // AGP 8.10 默认 build-tools 35.0.0 本机没有，显式用已安装的 36.0.0，避免构建时联网拉 SDK 组件
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "com.shuati.app"
        minSdk = 21
        targetSdk = 36
        // versionCode ≙ version.json 的 update 序号（旧版目前 14），随每次发布 +1
        versionCode = 15
        versionName = "3.0"
    }

    signingConfigs {
        create("release") {
            // 口令在根目录 keystore.properties（gitignored），缺失时 release 不签名仍可构建
            val propsFile = rootProject.file("keystore.properties")
            if (propsFile.exists()) {
                val props = Properties().apply { propsFile.inputStream().use { load(it) } }
                val ks = rootProject.file(props.getProperty("storeFile") ?: "keystore/quiz.keystore")
                if (ks.exists()) {
                    storeFile = ks
                    storePassword = props.getProperty("storePassword")
                    keyAlias = props.getProperty("keyAlias")
                    keyPassword = props.getProperty("keyPassword")
                }
            }
        }
    }

    buildTypes {
        debug {
            // debug 与 release 可共存于同一台手机
            applicationIdSuffix = ".debug"
        }
        release {
            // 首版不开混淆，规避 R8 风险；AGP 自动完成对齐+V1/V2 签名（旧版坑 #7 消失）
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.foundation)

    implementation(libs.room.runtime)
    ksp(libs.room.compiler)
    implementation(libs.datastore.preferences)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
}
