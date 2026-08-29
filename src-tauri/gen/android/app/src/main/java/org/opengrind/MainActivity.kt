package org.opengrind

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import io.crates.keyring.Keyring

class MainActivity : TauriActivity() {
	private var insetsTop = 0
	private var insetsBottom = 0
	private var insetsLeft = 0
	private var insetsRight = 0
	@Volatile private var imeVisibleState = false
	private var webViewRef: WebView? = null
	private var pendingWebViewWarning: WebViewSupport.Status? = null
	private var shownWebViewWarning = false

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

	companion object {
		private const val NOTIFICATION_CHANNEL_ID = "open_messages"
		private const val PERMISSION_REQUEST_CODE_NOTIFICATIONS = 1001
	}

	inner class InsetsInterface {
		@JavascriptInterface fun top() = insetsTop
		@JavascriptInterface fun bottom() = insetsBottom
		@JavascriptInterface fun left() = insetsLeft
		@JavascriptInterface fun right() = insetsRight
		@JavascriptInterface fun imeVisible() = imeVisibleState
	}

	inner class BackInterface {
		@JavascriptInterface fun moveTaskToBack() {
			runOnUiThread { this@MainActivity.moveTaskToBack(true) }
		}
	}

	inner class NotificationInterface {
		@JavascriptInterface
		fun showNotification(id: Int, title: String, body: String, conversationId: String?) {
			runOnUiThread {
				sendNativeNotification(id, title, body, conversationId)
			}
		}

		@JavascriptInterface
		fun requestPermission() {
			runOnUiThread {
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
					if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
						requestPermissions(
							arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
							PERMISSION_REQUEST_CODE_NOTIFICATIONS
						)
					}
				}
			}
		}

		@JavascriptInterface
		fun startBackgroundService() {
			runOnUiThread {
				startBackgroundServiceInternal()
			}
		}

		@JavascriptInterface
		fun stopBackgroundService() {
			runOnUiThread {
				stopBackgroundServiceInternal()
			}
		}

		@JavascriptInterface
		fun requestIgnoreBatteryOptimizations() {
			runOnUiThread {
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
					try {
						val powerManager = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
						if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(packageName)) {
							val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
								data = Uri.parse("package:$packageName")
							}
							startActivity(intent)
						}
					} catch (e: Exception) {
						e.printStackTrace()
					}
				}
			}
		}

		@JavascriptInterface
		fun openNotificationSettings() {
			runOnUiThread {
				try {
					val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
						Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
							putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
						}
					} else {
						Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
							data = Uri.parse("package:$packageName")
						}
					}
					startActivity(intent)
				} catch (e: Exception) {
					e.printStackTrace()
				}
			}
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
	}

	private fun startBackgroundServiceInternal() {
		try {
			val serviceIntent = Intent(this, BackgroundSyncService::class.java).apply {
				action = BackgroundSyncService.ACTION_START
			}
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				startForegroundService(serviceIntent)
			} else {
				startService(serviceIntent)
			}
		} catch (e: Exception) {
			e.printStackTrace()
		}
	}

	private fun stopBackgroundServiceInternal() {
		try {
			val serviceIntent = Intent(this, BackgroundSyncService::class.java).apply {
				action = BackgroundSyncService.ACTION_STOP
			}
			startService(serviceIntent)
		} catch (e: Exception) {
			e.printStackTrace()
		}
	}

	private fun createNotificationChannel() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			val channel = NotificationChannel(
				NOTIFICATION_CHANNEL_ID,
				"Messages",
				NotificationManager.IMPORTANCE_HIGH
			).apply {
				description = "Direct messages notifications"
				enableLights(true)
				enableVibration(true)
				setShowBadge(true)
				lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
			}
			val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
			notificationManager?.createNotificationChannel(channel)
		}
	}

	private fun sendNativeNotification(id: Int, title: String, body: String, conversationId: String?) {
		val intent = Intent(this, MainActivity::class.java).apply {
			flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
			if (!conversationId.isNullOrEmpty()) {
				putExtra("conversationId", conversationId)
			}
		}
		val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
		} else {
			PendingIntent.FLAG_UPDATE_CURRENT
		}
		val pendingIntent = PendingIntent.getActivity(this, id, intent, flags)

		val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
			.setSmallIcon(R.drawable.ic_launcher_foreground)
			.setContentTitle(title)
			.setContentText(body)
			.setStyle(NotificationCompat.BigTextStyle().bigText(body))
			.setPriority(NotificationCompat.PRIORITY_HIGH)
			.setCategory(NotificationCompat.CATEGORY_MESSAGE)
			.setDefaults(NotificationCompat.DEFAULT_ALL)
			.setAutoCancel(true)
			.setContentIntent(pendingIntent)
			.build()

		try {
			NotificationManagerCompat.from(this).notify(id, notification)
		} catch (_: SecurityException) {
		}
	}

	override fun onPause() {
		super.onPause()
		webViewRef?.onResume()
		webViewRef?.resumeTimers()
	}

	override fun onStop() {
		super.onStop()
		webViewRef?.onResume()
		webViewRef?.resumeTimers()
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		setIntent(intent)
		val conversationId = intent.getStringExtra("conversationId")
		if (!conversationId.isNullOrEmpty()) {
			webViewRef?.evaluateJavascript("window.location.href = '/chat/${conversationId}'", null)
		}
	}
	
	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		Keyring.initializeNdkContext(applicationContext)
		createNotificationChannel()
		startBackgroundServiceInternal()
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
				requestPermissions(
					arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
					PERMISSION_REQUEST_CODE_NOTIFICATIONS
				)
			}
		}
		pendingWebViewWarning = WebViewSupport.current(
			context = this,
			minSupportedMajor = BuildConfig.MIN_SUPPORTED_WEBVIEW_MAJOR,
		).takeIf { it.disposition == WebViewSupport.Disposition.WARNING }
		super.onCreate(savedInstanceState)

		onBackPressedDispatcher.addCallback(this, backGestureCallback)

		WindowInsetsControllerCompat(window, window.decorView).apply {
			isAppearanceLightStatusBars = false
			isAppearanceLightNavigationBars = false
		}
		
		ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
			val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
			val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
			val isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
			imeVisibleState = isImeVisible
			val density = resources.displayMetrics.density
			
			insetsTop = (bars.top / density).toInt()
			insetsBottom = if (isImeVisible) 0 else (bars.bottom / density).toInt()
			insetsLeft = (bars.left / density).toInt()
			insetsRight = (bars.right / density).toInt()
			
			val bottomMargin = if (isImeVisible) ime.bottom else 0
			webViewRef?.let { wv ->
				(wv.layoutParams as? ViewGroup.MarginLayoutParams)?.let { params ->
					if (params.bottomMargin != bottomMargin) {
						params.bottomMargin = bottomMargin
						wv.layoutParams = params
					}
				}
			}
			
			webViewRef?.evaluateJavascript("window.__reapplyInsets?.()", null)
			
			ViewCompat.onApplyWindowInsets(view, insets)
		}
	}
	
	override fun onWebViewCreate(webView: WebView) {
		super.onWebViewCreate(webView)
		webViewRef = webView
		webView.settings.setGeolocationEnabled(false)
		webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
		webView.settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			webView.settings.setOffscreenPreRaster(true)
		}
		webView.addJavascriptInterface(InsetsInterface(), "__AndroidInsets")
		webView.addJavascriptInterface(BackInterface(), "__AndroidBack")
		webView.addJavascriptInterface(NotificationInterface(), "__AndroidNotification")
		webView.addJavascriptInterface(DownloadInterface(), "__AndroidDownload")
		webView.setDownloadListener { url, _, _, _, _ ->
			DownloadInterface().download(url, null)
		}
		maybeWarnAboutWebView()
	}

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
