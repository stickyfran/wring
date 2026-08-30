package org.opengrind

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class OpenGrindBootReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context, intent: Intent) {
		if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != "android.intent.action.QUICKBOOT_POWERON") {
			return
		}

		if (OpenGrindSecureStorage.isBackgroundServiceEnabled(context)) {
			val serviceIntent = Intent(context, BackgroundSyncService::class.java).apply {
				action = BackgroundSyncService.ACTION_START
			}
			try {
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
					context.startForegroundService(serviceIntent)
				} else {
					context.startService(serviceIntent)
				}
			} catch (e: Exception) {
				e.printStackTrace()
			}
		}
	}
}
