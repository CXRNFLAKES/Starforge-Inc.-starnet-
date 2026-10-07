import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../android/", import.meta.url);
const gradle = fs.readFileSync(new URL("app/build.gradle.kts", root), "utf8");
const manifest = fs.readFileSync(new URL("app/src/main/AndroidManifest.xml", root), "utf8");
const activity = fs.readFileSync(new URL("app/src/main/java/ai/starforge/android9/MainActivity.java", root), "utf8");
const html = fs.readFileSync(new URL("app/src/main/assets/index.html", root), "utf8");

test("M1 Android 9 package pins API 28 minimum and target", () => {
  assert.match(gradle, /minSdk\s*=\s*28/);
  assert.match(gradle, /targetSdk\s*=\s*28/);
  assert.match(gradle, /applicationId\s*=\s*"ai\.starforge\.android9"/);
});

test("M1 Android 9 package launches a portrait WebView shell", () => {
  assert.match(manifest, /android:screenOrientation="portrait"/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(activity, /loadUrl\(APP_ORIGIN \+ "\/assets\/index\.html"\)/);
  assert.match(activity, /setJavaScriptEnabled\(true\)/);
});

test("M1 Android 9 package keeps the runtime in safe mode", () => {
  assert.match(html, /SAFE MODE/);
  assert.match(html, /API 28/);
  assert.doesNotMatch(activity, /APINEX_API_KEY|OPENAI_API_KEY|Bearer/i);
});
