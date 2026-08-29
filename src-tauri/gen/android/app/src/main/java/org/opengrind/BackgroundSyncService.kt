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

class BackgroundSyncService : Service() {
	private var wakeLock: PowerManager.WakeLock? = null

	companion object {
		const val CHANNEL_ID = "open_background_service"
		const val NOTIFICATION_ID = 9999
		const val ACTION_START = "org.opengrind.action.START_BG_SERVICE"
		const val ACTION_STOP = "org.opengrind.action.STOP_BG_SERVICE"
	}

	override fun onBind(intent: Intent?): IBinder? = null

	override fun onCreate() {
		super.onCreate()
		createNotificationChannel()
		acquireWakeLock()
	}

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		if (intent?.action == ACTION_STOP) {
			releaseWakeLock()
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

		return START_STICKY
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

	override fun onDestroy() {
		super.onDestroy()
		releaseWakeLock()
	}

	private fun createNotificationChannel() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			val channel = NotificationChannel(
				CHANNEL_ID,
				"Background Connection",
				NotificationManager.IMPORTANCE_LOW
			).apply {
				description = "Keeps Open connected to receive messages in background"
				setShowBadge(false)
			}
			val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
			manager?.createNotificationChannel(channel)
		}
	}
}
