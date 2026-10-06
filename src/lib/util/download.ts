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

	const isVideoHint =
		rawUrl.includes("ogmedia.localhost/v") ||
		rawUrl.includes("ogmedia:/v") ||
		rawUrl.includes("ogmedia://localhost/v") ||
		url.includes(".mp4") ||
		url.includes("video") ||
		url.includes("/v");

	let filename = suggestedFilename;
	if (!filename) {
		const ext = isVideoHint ? ".mp4" : ".jpg";
		filename = `open_${Date.now()}${ext}`;
	}

	// 1. First try fetching via the app proxy / local cache directly
	try {
		if (!quiet) toast.loading("Downloading...", { id: "media-download" });
		const response = await fetch(rawUrl);
		if (!response.ok) throw new Error(`HTTP error ${response.status}`);
		const blob = await response.blob();

		const mimeType =
			blob.type || (isVideoHint ? "video/mp4" : "image/jpeg");
		const isVideoActual = isVideoHint || mimeType.startsWith("video/");
		if (!suggestedFilename) {
			const ext = isVideoActual
				? ".mp4"
				: mimeType.includes("png")
					? ".png"
					: ".jpg";
			filename = `open_${Date.now()}${ext}`;
		}

		// 1a. If Android native base64 saver is available, save directly to storage
		if (
			typeof window !== "undefined" &&
			window.__AndroidDownload?.saveBase64ToSubdir
		) {
			const base64Data = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					const res = reader.result as string;
					const base64 = res.split(",")[1] || "";
					resolve(base64);
				};
				reader.onerror = reject;
				reader.readAsDataURL(blob);
			});

			const saved = window.__AndroidDownload.saveBase64ToSubdir(
				base64Data,
				filename,
				subDir,
				mimeType,
			);
			if (saved) {
				if (!quiet) {
					toast.success(
						subDir
							? `Saved to Open/${subDir}`
							: "Saved to downloads",
						{ id: "media-download" },
					);
				}
				return true;
			}
		}

		// 1b. Desktop / Web / WebView Blob download
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
			"Direct fetch download failed, attempting Android download / link fallback:",
			error,
		);

		// 2. Android Native Download Manager fallback with original URL
		if (typeof window !== "undefined" && window.__AndroidDownload) {
			try {
				if (window.__AndroidDownload.downloadToSubdir) {
					window.__AndroidDownload.downloadToSubdir(
						url,
						filename,
						subDir,
					);
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
				console.error("Android DownloadManager failed:", e);
			}
		}

		// 3. Last fallback: anchor click with url
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
				toast.error("Failed to download media", {
					id: "media-download",
				});
			}
			return false;
		}
	}
}

export function saveTextFile(
	content: string,
	filename: string,
	subDir?: string,
): boolean {
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
