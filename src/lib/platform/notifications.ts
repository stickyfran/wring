import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";

export async function sendNtfyPush({
	title,
	body,
	conversationId,
}: {
	title: string;
	body: string;
	conversationId?: string;
}): Promise<boolean> {
	const prefs = getPreferencesSnapshot();
	if (!prefs.ntfyEnabled || !prefs.ntfyTopic.trim()) return false;

	let baseUrl = prefs.ntfyServer.trim().replace(/\/+$/, "");
	if (!baseUrl) baseUrl = "https://ntfy.sh";
	const topic = prefs.ntfyTopic.trim().replace(/^\/+/, "");
	const url = `${baseUrl}/${topic}`;

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Title: title,
				Priority: "urgent",
				Tags: "speech_balloon,open",
				Click: conversationId
					? `opengrind://chat/${conversationId}`
					: "opengrind://chat",
			},
			body,
		});
		return res.ok;
	} catch (error) {
		console.error("Failed to send ntfy push notification:", error);
		return false;
	}
}

export function showSystemNotification({
	title,
	body,
	conversationId,
}: {
	title: string;
	body: string;
	conversationId?: string;
}): void {
	if (typeof window !== "undefined" && window.__AndroidNotification) {
		const id = Math.floor(Math.random() * 1000000);
		window.__AndroidNotification.showNotification(
			id,
			title,
			body,
			conversationId ?? "",
		);
	} else if (
		typeof window !== "undefined" &&
		"Notification" in window &&
		Notification.permission === "granted"
	) {
		try {
			new Notification(title, { body });
		} catch (error) {
			console.error("Failed to show web notification", error);
		}
	}

	void sendNtfyPush({ title, body, conversationId });
}

export function showSystemNotificationForMessage({
	message,
	conversation,
}: {
	message: ApiResponseMessage;
	conversation: Conversation;
}): void {
	if (conversation.data.muted) return;

	const senderName = conversation.data.name || "Someone";
	let bodyText = "New message";

	if (message.type === "Text" && typeof message.body?.text === "string") {
		bodyText = message.body.text;
	} else {
		switch (message.type) {
			case "Image":
			case "ExpiringImage":
				bodyText = "📷 Photo";
				break;
			case "Album":
			case "ExpiringAlbum":
			case "ExpiringAlbumV2":
				bodyText = "📁 Album";
				break;
			case "Video":
			case "NonExpiringVideo":
			case "PrivateVideo":
				bodyText = "🎥 Video";
				break;
			case "Audio":
				bodyText = "🎤 Voice message";
				break;
			case "Location":
				bodyText = "📍 Location";
				break;
			case "Giphy":
			case "Gaymoji":
				bodyText = "Sticker";
				break;
			default:
				if (conversation.data.preview?.text) {
					bodyText = conversation.data.preview.text;
				} else {
					bodyText = "Sent you a message";
				}
		}
	}

	showSystemNotification({
		title: senderName,
		body: bodyText,
		conversationId: conversation.data.conversationId,
	});
}

export function requestSystemNotificationPermission(): void {
	if (typeof window !== "undefined" && window.__AndroidNotification) {
		window.__AndroidNotification.requestPermission();
		syncBackgroundServiceState();
		return;
	}

	if (
		typeof window !== "undefined" &&
		"Notification" in window &&
		Notification.permission === "default"
	) {
		Notification.requestPermission().catch((error) => {
			console.error("Failed to request web notification permission", error);
		});
	}
}

export function syncBackgroundServiceState(): void {
	if (typeof window === "undefined" || !window.__AndroidNotification) return;
	const prefs = getPreferencesSnapshot();
	if (prefs.backgroundService) {
		window.__AndroidNotification.startBackgroundService?.();
	} else {
		window.__AndroidNotification.stopBackgroundService?.();
	}
}

export function requestIgnoreBatteryOptimizations(): void {
	if (typeof window === "undefined" || !window.__AndroidNotification) return;
	window.__AndroidNotification.requestIgnoreBatteryOptimizations?.();
}

export function openNotificationSettings(): void {
	if (typeof window === "undefined" || !window.__AndroidNotification) return;
	window.__AndroidNotification.openNotificationSettings?.();
}
