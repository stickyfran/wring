package org.opengrind

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.TextView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.opengrind.push.AppForeground
import org.opengrind.push.PushNotifier

class MainActivity : TauriActivity() {
	private data class WebInsets(
		val top: Double,
		val bottom: Double,
		val left: Double,
		val right: Double,
		val imeVisible: Boolean,
	) {
		fun toJavascript() = "{ top: $top, bottom: $bottom, left: $left, right: $right, ime: $imeVisible }"
	}

	@Volatile private var webInsets = WebInsets(top = 0.0, bottom = 0.0, left = 0.0, right = 0.0, imeVisible = false)
	private var sentWebInsets: WebInsets? = null
	@Volatile private var backGestureProgress = 0f
	private var webViewRef: WebView? = null
	private var pendingWebViewWarning: WebViewSupport.Status? = null
	private var shownWebViewWarning = false
	private val hoverRepair = WebViewHoverRepair(context = this, webView = { webViewRef })

	override val handleBackNavigation = false

	private val backGestureCallback = object : OnBackPressedCallback(true) {
		override fun handleOnBackPressed() {
			val webView = webViewRef
			if (webView == null) {
				fallThrough()
				return
			}
			webView.evaluateJavascript(
				"try { window.__AndroidOnBackGesture?.() } catch (error) { console.error(error); true; }"
			) { result ->
				if (result != "false") {
					if (webView.canGoBack()) webView.goBack() else fallThrough()
				}
			}
		}

		private fun fallThrough() {
			isEnabled = false
			onBackPressedDispatcher.onBackPressed()
			isEnabled = true
		}
	}

	inner class InsetsInterface {
		@JavascriptInterface fun top() = webInsets.top
		@JavascriptInterface fun bottom() = webInsets.bottom
		@JavascriptInterface fun left() = webInsets.left
		@JavascriptInterface fun right() = webInsets.right
		@JavascriptInterface fun imeVisible() = webInsets.imeVisible
	}

	private val backProgressCallback = object : OnBackPressedCallback(true) {
		override fun handleOnBackStarted(backEvent: BackEventCompat) {
			backGestureProgress = 0f
			webViewRef?.evaluateJavascript("window.__AndroidOnBackGestureStart?.()", null)
		}

		override fun handleOnBackProgressed(backEvent: BackEventCompat) {
			backGestureProgress = backEvent.progress
		}

		override fun handleOnBackCancelled() {
			backGestureProgress = 0f
			webViewRef?.evaluateJavascript("window.__AndroidOnBackGestureCancel?.()", null)
		}

		override fun handleOnBackPressed() {
			isEnabled = false
			onBackPressedDispatcher.onBackPressed()
			isEnabled = true
		}
	}

	inner class BackInterface {
		@JavascriptInterface fun gestureProgress() = backGestureProgress

		@JavascriptInterface fun moveTaskToBack() {
			runOnUiThread { this@MainActivity.moveTaskToBack(true) }
		}
	}

	inner class DownloadInterface {
		@JavascriptInterface
		fun download(url: String, filename: String?) {
			downloadToSubdir(url, filename, null)
		}

		@JavascriptInterface
		fun downloadToSubdir(url: String, filename: String?, subDir: String?) {
			runOnUiThread {
				try {
					val uri = Uri.parse(url)
					val isVideo = url.contains(".mp4") || url.contains("video") || url.contains("/v")
					val ext = if (isVideo) ".mp4" else ".jpg"
					val safeFilename = filename?.takeIf { it.isNotBlank() } ?: "open_${System.currentTimeMillis()}$ext"
					val destinationPath = if (!subDir.isNullOrBlank()) {
						val safeSub = subDir.trim().replace(Regex("[^a-zA-Z0-9_.-]"), "_")
						"Open/$safeSub/$safeFilename"
					} else {
						"Open/$safeFilename"
					}
					val request = DownloadManager.Request(uri).apply {
						setTitle(safeFilename)
						setDescription("Downloading media from Open")
						setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
						setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, destinationPath)
						setAllowedOverMetered(true)
						setAllowedOverRoaming(true)
					}
					val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
					downloadManager?.enqueue(request)
				} catch (e: Exception) {
					e.printStackTrace()
				}
			}
		}

		@JavascriptInterface
		fun saveTextFileToSubdir(content: String, filename: String, subDir: String?) {
			runOnUiThread {
				try {
					val safeSub = subDir?.trim()?.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
					val relativePath = if (!safeSub.isNullOrBlank()) {
						"Open/$safeSub"
					} else {
						"Open"
					}
					if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
						val values = android.content.ContentValues().apply {
							put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, filename)
							put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "text/plain")
							put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$relativePath")
						}
						val resolver = contentResolver
						val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
						if (uri != null) {
							resolver.openOutputStream(uri)?.use { outputStream ->
								outputStream.write(content.toByteArray(Charsets.UTF_8))
							}
						}
					} else {
						val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
						val targetDir = java.io.File(downloadsDir, relativePath)
						if (!targetDir.exists()) targetDir.mkdirs()
						val file = java.io.File(targetDir, filename)
						file.writeText(content, Charsets.UTF_8)
					}
				} catch (e: Exception) {
					e.printStackTrace()
				}
			}
		}

		@JavascriptInterface
		fun saveBase64ToSubdir(base64Data: String, filename: String, subDir: String?, mimeType: String?): Boolean {
			return try {
				val safeSub = subDir?.trim()?.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
				val relativePath = if (!safeSub.isNullOrBlank()) {
					"Open/$safeSub"
				} else {
					"Open"
				}
				val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
				val isVideo = filename.endsWith(".mp4", ignoreCase = true) || mimeType?.startsWith("video/") == true
				val contentType = mimeType?.takeIf { it.isNotBlank() } ?: if (isVideo) "video/mp4" else "image/jpeg"

				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
					val values = android.content.ContentValues().apply {
						put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, filename)
						put(android.provider.MediaStore.MediaColumns.MIME_TYPE, contentType)
						put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$relativePath")
					}
					val resolver = contentResolver
					val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
					if (uri != null) {
						resolver.openOutputStream(uri)?.use { outputStream ->
							outputStream.write(bytes)
						}
					}
				} else {
					val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
					val targetDir = java.io.File(downloadsDir, relativePath)
					if (!targetDir.exists()) targetDir.mkdirs()
					val file = java.io.File(targetDir, filename)
					java.io.FileOutputStream(file).use { it.write(bytes) }
					android.media.MediaScannerConnection.scanFile(
						applicationContext,
						arrayOf(file.absolutePath),
						arrayOf(contentType),
						null
					)
				}
				true
			} catch (e: Exception) {
				e.printStackTrace()
				false
			}
		}
	}

	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		pendingWebViewWarning = WebViewSupport.current(
			context = this,
			minSupportedMajor = BuildConfig.MIN_SUPPORTED_WEBVIEW_MAJOR,
		).takeIf { it.disposition == WebViewSupport.Disposition.WARNING }
		if (isRelaunch(savedInstanceState)) intent.removeExtra(PushNotifier.EXTRA_DEEPLINK)
		super.onCreate(savedInstanceState)
		AppForeground.catchUpPollingOnLeave(this)

		onBackPressedDispatcher.addCallback(this, backGestureCallback)

		WindowInsetsControllerCompat(window, window.decorView).apply {
			isAppearanceLightStatusBars = false
			isAppearanceLightNavigationBars = false
		}
		
		ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { view, insets ->
			val bars = insets.getInsets(
				WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
			)
			val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
			val isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
			val density = resources.displayMetrics.density.toDouble()
			
			val nextInsets = WebInsets(
				top = bars.top / density,
				bottom = if (isImeVisible) 0.0 else bars.bottom / density,
				left = bars.left / density,
				right = bars.right / density,
				imeVisible = isImeVisible,
			)
			webInsets = nextInsets
			
			val bottomMargin = if (isImeVisible) ime.bottom else 0
			webViewRef?.let { wv ->
				(wv.layoutParams as? ViewGroup.MarginLayoutParams)?.let { params ->
					if (params.bottomMargin != bottomMargin) {
						params.bottomMargin = bottomMargin
						wv.layoutParams = params
					}
				}
			}
			
			val webView = webViewRef
			if (webView != null && nextInsets != sentWebInsets) {
				sentWebInsets = nextInsets
				webView.evaluateJavascript("window.__reapplyInsets?.(${nextInsets.toJavascript()})", null)
			}
			
			ViewCompat.onApplyWindowInsets(view, insets)
		}
	}

	override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
		hoverRepair.observe(event)
		return super.dispatchGenericMotionEvent(event)
	}

	override fun dispatchTouchEvent(event: MotionEvent): Boolean {
		hoverRepair.observe(event)
		return super.dispatchTouchEvent(event)
	}

	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)
		webView.isHapticFeedbackEnabled = false
		webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
		webView.overScrollMode = android.view.View.OVER_SCROLL_ALWAYS
		webView.isVerticalScrollBarEnabled = false
		webView.isHorizontalScrollBarEnabled = false
		webView.settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			webView.settings.setOffscreenPreRaster(true)
		}
		webView.addJavascriptInterface(InsetsInterface(), "__AndroidInsets")
		webView.addJavascriptInterface(BackInterface(), "__AndroidBack")
		webView.addJavascriptInterface(DownloadInterface(), "__AndroidDownload")
		webView.setDownloadListener { url, _, _, _, _ ->
			DownloadInterface().download(url, null)
		}
		// Registered here, not in onCreate: Tauri's AppPlugin adds its own back
		// callback while the plugins load, and only the last one added gets the
		// gesture progress. Move this earlier and the progress stops arriving.
		backProgressCallback.remove()
		onBackPressedDispatcher.addCallback(this, backProgressCallback)
		maybeWarnAboutWebView()
	}

	private fun isRelaunch(savedInstanceState: Bundle?) =
		savedInstanceState != null || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0

	private fun maybeWarnAboutWebView() {
		val warning = pendingWebViewWarning ?: return
		val webView = webViewRef ?: return
		if (shownWebViewWarning) return
		shownWebViewWarning = true
		webView.visibility = WebView.INVISIBLE

		val view = layoutInflater.inflate(R.layout.dialog_webview_warning, null, false)
		view.findViewById<TextView>(R.id.dialog_message).text = buildWebViewWarningMessage(warning)

		val dialog = MaterialAlertDialogBuilder(this, R.style.ThemeOverlay_OpenGrind_WebViewDialog)
			.setView(view)
			.setCancelable(false)
			.create()

		view.findViewById<MaterialButton>(R.id.button_update).setOnClickListener {
			dialog.dismiss()
			openWebViewUpdate(warning)
			revealWebView()
		}
		view.findViewById<MaterialButton>(R.id.button_continue).setOnClickListener {
			dialog.dismiss()
			revealWebView()
		}

		dialog.show()
	}

	private fun revealWebView() {
		webViewRef?.visibility = WebView.VISIBLE
	}

	private fun buildWebViewWarningMessage(status: WebViewSupport.Status): String {
		val provider = status.packageName ?: "Unknown provider"
		val version = status.versionName ?: "Unknown version"
		return "Open Grind may not display correctly on older Android System WebView " +
			"versions. This build expects WebView ${status.minSupportedMajor} or newer.\n\n" +
			"Detected provider: $provider ($version)"
	}

	private fun openWebViewUpdate(status: WebViewSupport.Status) {
		val packageName = status.packageName
		val intents = buildList {
			if (packageName != null) {
				add(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
				add(
					Intent(
						Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
						Uri.parse("package:$packageName"),
					),
				)
			}
			add(Intent(Settings.ACTION_SETTINGS))
		}

		for (intent in intents) {
			try {
				startActivity(intent)
				return
			} catch (_: ActivityNotFoundException) {
			}
		}
	}
}
