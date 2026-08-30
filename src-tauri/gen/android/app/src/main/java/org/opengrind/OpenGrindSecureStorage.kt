package org.opengrind

import android.content.Context
import android.content.SharedPreferences

object OpenGrindSecureStorage {
	private const val PREFS_NAME = "open_grind_secure_storage"
	private const val KEY_AUTH_TOKEN = "auth_token"
	private const val KEY_PROFILE_ID = "profile_id"
	private const val KEY_BG_ENABLED = "bg_sync_enabled"

	private fun getPrefs(context: Context): SharedPreferences {
		return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
	}

	fun saveCredentials(context: Context, token: String, profileId: Long) {
		getPrefs(context).edit()
			.putString(KEY_AUTH_TOKEN, token)
			.putLong(KEY_PROFILE_ID, profileId)
			.apply()
	}

	fun getAuthToken(context: Context): String? {
		return getPrefs(context).getString(KEY_AUTH_TOKEN, null)
	}

	fun getProfileId(context: Context): Long? {
		val id = getPrefs(context).getLong(KEY_PROFILE_ID, -1L)
		return if (id != -1L) id else null
	}

	fun clearCredentials(context: Context) {
		getPrefs(context).edit()
			.remove(KEY_AUTH_TOKEN)
			.remove(KEY_PROFILE_ID)
			.apply()
	}

	fun setBackgroundServiceEnabled(context: Context, enabled: Boolean) {
		getPrefs(context).edit()
			.putBoolean(KEY_BG_ENABLED, enabled)
			.apply()
	}

	fun isBackgroundServiceEnabled(context: Context): Boolean {
		return getPrefs(context).getBoolean(KEY_BG_ENABLED, false)
	}
}
