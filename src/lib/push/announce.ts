import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import { isDesktopPlatform } from "$lib/platform/os";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import { conversationDeeplink, TAPS_DEEPLINK } from "./deeplink";
import { notify } from "./index";
import { type Announcement, TAP_TAG_PREFIX } from "./types";

const SOMEONE = "Someone";
const MESSAGE_BODY = "Sent you a message";
const TAP_BODY = "Tapped you";

const MESSAGE_BODIES: Partial<Record<ApiResponseMessage["type"], string>> = {
	Image: "Sent you a picture",
	ProfilePhotoReply: "Sent you a picture",
	ExpiringImage: "Sent you an expiring image",
	Album: "Shared their album",
	ExpiringAlbum: "Shared their album",
	ExpiringAlbumV2: "Shared their album",
	AlbumContentReply: "Shared their album",
	AlbumContentReaction: "Liked your album content",
	Audio: "Sent you an audio message",
	Video: "Sent you a video",
	PrivateVideo: "Sent you a video",
	NonExpiringVideo: "Sent you a video",
	Gaymoji: "Sent you a Gaymoji",
	Giphy: "Sent you a GIF",
	Location: "Sent you their location",
};

function typedText(message: ApiResponseMessage): string {
	switch (message.type) {
		case "Text":
			return message.body.text;
		case "AlbumContentReply":
			return message.body.albumContentReply;
		case "ProfilePhotoReply":
			return message.body.photoContentReply;
		default:
			return "";
	}
}

async function forwardToNtfy(announcement: Announcement): Promise<void> {
	try {
		const prefs = preferencesSnapshot();
		if (!prefs.ntfyEnabled || !prefs.ntfyTopic.trim()) return;

		const baseUrl = prefs.ntfyServer.trim().replace(/\/+$/, "");
		const topicClean = prefs.ntfyTopic.trim().replace(/^\/+/, "");
		if (!baseUrl || !topicClean) return;

		const url = `${baseUrl}/${topicClean}`;
		const tag =
			announcement.category === "messages"
				? "speech_balloon"
				: "sparkles";

		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				topic: topicClean,
				title: announcement.title,
				message: announcement.body,
				priority: 4,
				tags: [tag, "open"],
				click: announcement.deeplink,
			}),
		});
	} catch (error) {
		console.error("Failed to forward announcement to ntfy:", error);
	}
}

function announce(announcement: Announcement): void {
	void forwardToNtfy(announcement);
	if (!isDesktopPlatform()) return;
	notify(announcement).catch((error: unknown) => {
		console.error("Failed to show the notification", error);
	});
}

export function announceMessage({
	message,
	sender,
}: {
	message: ApiResponseMessage;
	sender: string;
}): void {
	announce({
		category: "messages",
		tag: message.conversationId,
		messageId: message.messageId,
		title: sender || SOMEONE,
		body:
			typedText(message) ||
			(MESSAGE_BODIES[message.type] ?? MESSAGE_BODY),
		deeplink: conversationDeeplink(message.conversationId),
	});
}

export function announceTap({
	senderId,
	senderName,
}: {
	senderId: number;
	senderName: string | null;
}): void {
	announce({
		category: "taps",
		tag: `${TAP_TAG_PREFIX}${senderId}`,
		messageId: null,
		title: senderName || SOMEONE,
		body: TAP_BODY,
		deeplink: TAPS_DEEPLINK,
	});
}
