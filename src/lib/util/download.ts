import { toast } from "svelte-sonner";

import { extractOriginalMediaUrl } from "$lib/util/media";

export async function downloadMediaUrl(
	rawUrl: string,
	suggestedFilename?: string,
	subDir?: string,
	quiet = false,
): Promise<boolean> {
	if (!rawUrl) {
		if (!quiet) toast.error("No media URL found to download");
		return false;
	}

	const url = extractOriginalMediaUrl(rawUrl);

	let filename = suggestedFilename;
	if (!filename) {
		const isVideo =
			url.includes(".mp4") ||
			url.includes("video") ||
			url.includes("/v");
		const ext = isVideo ? ".mp4" : ".jpg";
		filename = `open_${Date.now()}${ext}`;
	}

	// 1. Android Native Download Manager
	if (typeof window !== "undefined" && window.__AndroidDownload) {
		try {
			if (window.__AndroidDownload.downloadToSubdir) {
				window.__AndroidDownload.downloadToSubdir(url, filename, subDir);
			} else {
				window.__AndroidDownload.download(url, filename);
			}
			if (!quiet) {
				toast.success(
					subDir
						? `Download started in Open/${subDir}`
						: "Download started (check notifications/downloads)",
					{ id: "media-download" },
				);
			}
			return true;
		} catch (e) {
			console.error(
				"Android native download failed, falling back to web fetch:",
				e,
			);
		}
	}

	// 2. Web / Desktop Blob Download
	try {
		if (!quiet) toast.loading("Downloading...", { id: "media-download" });
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

		if (!quiet) {
			toast.success("Downloaded successfully", { id: "media-download" });
		}
		return true;
	} catch (error) {
		console.warn(
			"Direct fetch download failed, attempting link click fallback:",
			error,
		);
		try {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.target = "_blank";
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			if (!quiet) {
				toast.success("Download opened in browser", {
					id: "media-download",
				});
			}
			return true;
		} catch (e) {
			console.error("All download methods failed:", e);
			if (!quiet) {
				toast.error("Failed to download media", { id: "media-download" });
			}
			return false;
		}
	}
}

export async function saveTextFile(
	content: string,
	filename: string,
	subDir?: string,
): Promise<boolean> {
	if (
		typeof window !== "undefined" &&
		window.__AndroidDownload?.saveTextFileToSubdir
	) {
		try {
			window.__AndroidDownload.saveTextFileToSubdir(
				content,
				filename,
				subDir,
			);
			return true;
		} catch (error) {
			console.error("Android native saveTextFile failed:", error);
		}
	}

	try {
		const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
		const blobUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = blobUrl;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
		return true;
	} catch (error) {
		console.error("Failed to save text file:", error);
		return false;
	}
}
