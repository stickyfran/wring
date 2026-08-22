import { toast } from "svelte-sonner";

import { extractOriginalMediaUrl } from "$lib/util/media";

export async function downloadMediaUrl(
	rawUrl: string,
	suggestedFilename?: string,
): Promise<void> {
	if (!rawUrl) {
		toast.error("No media URL found to download");
		return;
	}

	const url = extractOriginalMediaUrl(rawUrl);

	let filename = suggestedFilename;
	if (!filename) {
		const isVideo = url.includes(".mp4") || url.includes("video") || url.includes("/v");
		const ext = isVideo ? ".mp4" : ".jpg";
		filename = `open_${Date.now()}${ext}`;
	}

	// 1. Android Native Download Manager
	if (typeof window !== "undefined" && window.__AndroidDownload) {
		try {
			window.__AndroidDownload.download(url, filename);
			toast.success("Download started (check notifications/downloads)", {
				id: "media-download",
			});
			return;
		} catch (e) {
			console.error("Android native download failed, falling back to web fetch:", e);
		}
	}

	// 2. Web / Desktop Blob Download
	try {
		toast.loading("Downloading...", { id: "media-download" });
		const response = await fetch(rawUrl);
		if (!response.ok) throw new Error(`HTTP error ${response.status}`);
		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);

		const anchor = document.createElement("a");
		anchor.href = blobUrl;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

		toast.success("Downloaded successfully", { id: "media-download" });
	} catch (error) {
		console.warn("Direct fetch download failed, attempting link click fallback:", error);
		try {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.target = "_blank";
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			toast.success("Download opened in browser", { id: "media-download" });
		} catch (e) {
			console.error("All download methods failed:", e);
			toast.error("Failed to download media", { id: "media-download" });
		}
	}
}
