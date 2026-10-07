plugins {
    id("com.android.application")
}

android {
    namespace = "ai.starforge.android9"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.starforge.android9"
        minSdk = 28
        targetSdk = 28
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            minifyEnabled = false
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
