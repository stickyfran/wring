const fs = require("fs");
const file = "src-tauri/gen/android/app/src/main/java/org/opengrind/MainActivity.kt";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
`	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)`,
`	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)
		webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
		webView.settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			webView.settings.setOffscreenPreRaster(true)
		}`
);

fs.writeFileSync(file, content);
