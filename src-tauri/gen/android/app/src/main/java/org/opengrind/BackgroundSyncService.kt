package org.opengrind

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class BackgroundSyncService : Service() {
	private var wakeLock: PowerManager.WakeLock? = null
	private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
	private var syncJob: Job? = null
	private var wsClient: OkHttpClient? = null
	private var activeWebSocket: WebSocket? = null

	companion object {
		const val CHANNEL_ID = "open_background_service"
		const val MESSAGES_CHANNEL_ID = "open_messages"
		const val NOTIFICATION_ID = 9999
		const val ACTION_START = "org.opengrind.action.START_BG_SERVICE"
		const val ACTION_STOP = "org.opengrind.action.STOP_BG_SERVICE"

		fun sendNotification(context: Context, id: Int, title: String, body: String, conversationId: String?) {
			val intent = Intent(context, MainActivity::class.java).apply {
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
			val pendingIntent = PendingIntent.getActivity(context, id, intent, flags)

			val notification = NotificationCompat.Builder(context, MESSAGES_CHANNEL_ID)
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
				NotificationManagerCompat.from(context).notify(id, notification)
			} catch (_: SecurityException) {
			}
		}
	}

	override fun onBind(intent: Intent?): IBinder? = null

	override fun onCreate() {
		super.onCreate()
		createNotificationChannels()
		acquireWakeLock()
	}

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		if (intent?.action == ACTION_STOP) {
			cleanup()
			stopForeground(STOP_FOREGROUND_REMOVE)
			stopSelf()
			return START_NOT_STICKY
		}

		acquireWakeLock()

		val launchIntent = Intent(this, MainActivity::class.java).apply {
			this.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
		}
		val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
		} else {
			PendingIntent.FLAG_UPDATE_CURRENT
		}
		val pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingIntentFlags)

		val notification = NotificationCompat.Builder(this, CHANNEL_ID)
			.setSmallIcon(R.drawable.ic_launcher_foreground)
			.setContentTitle("Open")
			.setContentText("Connected for background notifications")
			.setPriority(NotificationCompat.PRIORITY_LOW)
			.setContentIntent(pendingIntent)
			.setOngoing(true)
			.build()

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
			startForeground(
				NOTIFICATION_ID,
				notification,
				ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
			)
		} else {
			startForeground(NOTIFICATION_ID, notification)
		}

		startSyncLoop()

		return START_STICKY
	}

	private fun startSyncLoop() {
		syncJob?.cancel()
		syncJob = serviceScope.launch {
			var backoffMs = 5_000L
			while (isActive) {
				val token = OpenGrindSecureStorage.getAuthToken(applicationContext)
				val ourProfileId = OpenGrindSecureStorage.getProfileId(applicationContext)

				if (!token.isNullOrEmpty() && ourProfileId != null) {
					try {
						connectWebSocket(token, ourProfileId)
					} catch (e: Exception) {
						e.printStackTrace()
					}
				}

				delay(backoffMs)
				backoffMs = (backoffMs * 2).coerceAtMost(60_000L)
			}
		}
	}

	private fun connectWebSocket(token: String, ourProfileId: Long) {
		activeWebSocket?.close(1000, "Reconnecting")
		activeWebSocket = null

		val client = OkHttpClient.Builder()
			.pingInterval(30, TimeUnit.SECONDS)
			.readTimeout(0, TimeUnit.MILLISECONDS)
			.build()
		wsClient = client

		val request = Request.Builder()
			.url("wss://chat.grindr.com/v1/ws")
			.addHeader("Authorization", "Grindr3 $token")
			.addHeader("User-Agent", "open-grind/android-bg")
			.build()

		val listener = object : WebSocketListener() {
			override fun onMessage(webSocket: WebSocket, text: String) {
				handleIncomingJson(text, ourProfileId)
			}

			override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
				activeWebSocket = null
			}

			override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
				activeWebSocket = null
			}
		}

		activeWebSocket = client.newWebSocket(request, listener)
	}

	private fun handleIncomingJson(text: String, ourProfileId: Long) {
		try {
			val json = JSONObject(text)
			val type = json.optString("type")
			if (type == "chat.v1.message_sent") {
				val payload = json.optJSONObject("payload") ?: return
				val senderId = payload.optLong("senderId")
				if (senderId == ourProfileId) return

				val conversationId = payload.optString("conversationId")
				val senderName = payload.optString("senderName").takeIf { it.isNotBlank() } ?: "Open"
				val body = payload.optJSONObject("body")?.optString("text") ?: "New message"

				val notifId = (System.currentTimeMillis() % 1000000).toInt()
				sendNotification(applicationContext, notifId, senderName, body, conversationId)
			}
		} catch (e: Exception) {
			e.printStackTrace()
		}
	}

	private fun acquireWakeLock() {
		try {
			if (wakeLock == null) {
				val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
				wakeLock = powerManager?.newWakeLock(
					PowerManager.PARTIAL_WAKE_LOCK,
					"Open:BackgroundSyncWakeLock"
				)?.apply {
					setReferenceCounted(false)
				}
			}
			wakeLock?.let {
				if (!it.isHeld) {
					it.acquire()
				}
			}
		} catch (e: Exception) {
			e.printStackTrace()
		}
	}

	private fun releaseWakeLock() {
		try {
			wakeLock?.let {
				if (it.isHeld) {
					it.release()
				}
			}
		} catch (e: Exception) {
			e.printStackTrace()
		}
	}

	private fun cleanup() {
		syncJob?.cancel()
		activeWebSocket?.close(1000, "Service stopped")
		activeWebSocket = null
		wsClient?.dispatcher?.executorService?.shutdown()
		serviceScope.cancel()
		releaseWakeLock()
	}

	override fun onDestroy() {
		super.onDestroy()
		cleanup()
	}

	private fun createNotificationChannels() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
			val bgChannel = NotificationChannel(
				CHANNEL_ID,
				"Background Connection",
				NotificationManager.IMPORTANCE_LOW
			).apply {
				description = "Keeps Open connected to receive messages in background"
				setShowBadge(false)
			}
			manager?.createNotificationChannel(bgChannel)

			val msgChannel = NotificationChannel(
				MESSAGES_CHANNEL_ID,
				"Messages",
				NotificationManager.IMPORTANCE_HIGH
			).apply {
				description = "Direct messages notifications"
				enableLights(true)
				enableVibration(true)
				setShowBadge(true)
				lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
			}
			manager?.createNotificationChannel(msgChannel)
		}
	}
}
