import { toast } from "svelte-sonner";

export async function downloadMediaUrl(
	url: string,
	suggestedFilename?: string,
): Promise<void> {
	try {
		toast.loading("Downloading...", { id: "media-download" });
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP error ${response.status}`);
		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);

		let filename = suggestedFilename;
		if (!filename) {
			const type = blob.type;
			const ext = type.includes("video")
				? ".mp4"
				: type.includes("png")
					? ".png"
					: type.includes("gif")
						? ".gif"
						: type.includes("webp")
							? ".webp"
							: ".jpg";
			filename = `open_${Date.now()}${ext}`;
		}

		const anchor = document.createElement("a");
		anchor.href = blobUrl;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

		toast.success("Downloaded successfully", { id: "media-download" });
	} catch (error) {
		console.error("Failed to download media:", error);
		toast.error("Failed to download media", { id: "media-download" });
	}
}
