package org.opengrind

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class BackgroundSyncService : Service() {
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
	}

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		if (intent?.action == ACTION_STOP) {
			stopForeground(STOP_FOREGROUND_REMOVE)
			stopSelf()
			return START_NOT_STICKY
		}

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
			.setPriority(NotificationCompat.PRIORITY_MIN)
			.setContentIntent(pendingIntent)
			.setOngoing(true)
			.build()

		startForeground(NOTIFICATION_ID, notification)
		return START_STICKY
	}

	private fun createNotificationChannel() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			val channel = NotificationChannel(
				CHANNEL_ID,
				"Background Connection",
				NotificationManager.IMPORTANCE_MIN
			).apply {
				description = "Keeps Open connected to receive messages in background"
				setShowBadge(false)
			}
			val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
			manager?.createNotificationChannel(channel)
		}
	}
}
