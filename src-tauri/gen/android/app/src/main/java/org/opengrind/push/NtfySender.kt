package org.opengrind.push

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object NtfySender {
	private val client = OkHttpClient.Builder()
		.connectTimeout(15, TimeUnit.SECONDS)
		.readTimeout(15, TimeUnit.SECONDS)
		.build()

	private val scope = CoroutineScope(Dispatchers.IO)

	fun send(context: Context, decision: PushDecision.Notify) {
		val enabled = PushSettings.ntfyEnabled(context)
		val server = PushSettings.ntfyServer(context)
		val topic = PushSettings.ntfyTopic(context)
		if (!enabled || topic.isBlank()) return

		val tag = if (decision.kind == PushKind.Message) "speech_balloon" else "sparkles"
		sendPayload(server, topic, decision.title, decision.body, tag, decision.deeplink)
	}

	fun sendPayload(
		server: String,
		topic: String,
		title: String,
		body: String,
		tag: String = "speech_balloon",
		click: String? = null,
	) {
		val baseUrl = server.trim().trimEnd('/')
		val topicClean = topic.trim().trimStart('/')
		if (baseUrl.isBlank() || topicClean.isBlank()) return

		val url = "$baseUrl/$topicClean"
		val json = JSONObject().apply {
			put("topic", topicClean)
			put("title", title)
			put("message", body)
			put("priority", 4)
			put("tags", JSONArray(listOf(tag, "open")))
			if (!click.isNullOrBlank()) {
				put("click", click)
			}
		}.toString()

		scope.launch {
			try {
				val request = Request.Builder()
					.url(url)
					.post(json.toRequestBody("application/json; charset=utf-8".toMediaType()))
					.build()
				client.newCall(request).execute().close()
			} catch (e: Exception) {
				e.printStackTrace()
			}
		}
	}

	fun sendTest(server: String, topic: String): Result<Unit> {
		val baseUrl = server.trim().trimEnd('/')
		val topicClean = topic.trim().trimStart('/')
		if (baseUrl.isBlank() || topicClean.isBlank()) {
			return Result.failure(IllegalArgumentException("Server and topic cannot be blank"))
		}

		val url = "$baseUrl/$topicClean"
		val json = JSONObject().apply {
			put("topic", topicClean)
			put("title", "Open - Test Notification")
			put("message", "ntfy push notifications are working without Google Services!")
			put("priority", 4)
			put("tags", JSONArray(listOf("white_check_mark", "open")))
			put("click", "grindr://chat")
		}.toString()

		return try {
			val request = Request.Builder()
				.url(url)
				.post(json.toRequestBody("application/json; charset=utf-8".toMediaType()))
				.build()
			val response = client.newCall(request).execute()
			val ok = response.isSuccessful
			val code = response.code
			response.close()
			if (ok) Result.success(Unit) else Result.failure(Exception("HTTP $code"))
		} catch (e: Exception) {
			Result.failure(e)
		}
	}
}
