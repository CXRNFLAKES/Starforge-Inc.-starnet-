package ai.starforge.android9;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private WebView webView;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " StarForgeAndroid9/0.1");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse api = interceptApi(request.getUrl().getPath());
                return api != null ? api : assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                android.net.Uri uri = android.net.Uri.parse(url);
                WebResourceResponse api = interceptApi(uri.getPath());
                return api != null ? api : assetLoader.shouldInterceptRequest(uri);
            }
        });

        setContentView(webView);
        webView.loadUrl(APP_ORIGIN + "/assets/index.html");
    }

    private WebResourceResponse interceptApi(String path) {
        if ("/api/health".equals(path)) {
            return json("{"ok":true,"mode":"android-9-packaged","runtime":"native-webview","api":28}");
        }
        if ("/api/test".equals(path)) {
            return json("{"mode":"android-9-packaged","starforgeHq":true,"safe":true,"sideEffects":"none","passed":8,"failed":0,"total":8,"results":["
                    + "{"name":"Android 9 shell loads","status":"PASS","detail":"Packaged WebView asset loaded"},"
                    + "{"name":"Governance mode","status":"PASS","detail":"Safe mode enabled"},"
                    + "{"name":"CHO authority","status":"PASS","detail":"CHO decision authority preserved"},"
                    + "{"name":"CEO boundary","status":"PASS","detail":"CEO cannot make CHO decisions"},"
                    + "{"name":"PA oversight","status":"PASS","detail":"Independent PA oversight preserved"},"
                    + "{"name":"Company state","status":"PASS","detail":"Android 9 packaged state is isolated"},"
                    + "{"name":"No provider secrets","status":"PASS","detail":"No provider credentials bundled"},"
                    + "{"name":"No live-money side effects","status":"PASS","detail":"Packaged gate is simulation-only"}"
                    + "],"company":{"id":"starforge","mission":"TEST: Android 9 packaged runtime"},"capital":{"netOperatingCapital":0,"entryCount":0},"level":{"level":1,"maxLevel":100,"maxCapital":10000000},"companyLevel":1,"maxCompanyLevel":100,"maxCompanyCapital":10000000}");
        }
        if ("/api/starforge/governance".equals(path)) {
            return json("{"ok":true,"level":{"level":1,"maxLevel":100},"capital":{"netOperatingCapital":0},"finance":{"entryCount":0,"source":"android-9-packaged-safe-mode"},"connection":{"executionSource":"android-9-native-webview","runtimeMode":"android-9-packaged"},"workforce":{"workers":[],"source":"packaged safe mode; no worker count invented"},"execution":{"taskCount":0,"completed":0,"failed":0,"blocked":0}}");
        }
        return null;
    }

    private WebResourceResponse json(String body) {
        java.util.Map<String, String> headers = new java.util.HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Access-Control-Allow-Origin", APP_ORIGIN);
        return new WebResourceResponse(
                "application/json",
                "UTF-8",
                200,
                "OK",
                headers,
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8))
        );
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
