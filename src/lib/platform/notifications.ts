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
		return;
	}

	if (
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
}

export function requestSystemNotificationPermission(): void {
	if (typeof window !== "undefined" && window.__AndroidNotification) {
		window.__AndroidNotification.requestPermission();
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
