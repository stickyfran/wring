import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { downloadMediaUrl } from "$lib/util/download";
import type { VideoSlide } from "./video";

const DOWNLOAD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0Zm-101.66,13.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,140.69V32a8,8,0,0,0-16,0V140.69L93.66,114.34A8,8,0,0,0,82.34,125.66Z"/></svg>`;

function getSlideMediaUrl(
	pswp: {
		currSlide?: {
			index: number;
			data?: Record<string, unknown>;
			content?: { element?: HTMLElement };
		};
	},
	videoAt?: (index: number) => VideoSlide | null,
): string | null {
	const slide = pswp.currSlide;
	if (!slide) return null;
	const video = videoAt ? videoAt(slide.index) : null;
	if (video?.src) return video.src;

	if (typeof slide.data?.src === "string" && slide.data.src) {
		return slide.data.src;
	}

	const elem = slide.data?.element as HTMLElement | undefined;
	if (elem) {
		if (elem instanceof HTMLAnchorElement && elem.href) return elem.href;
		const anchor = elem.closest("a") ?? elem.querySelector("a");
		if (anchor?.href) return anchor.href;
		const img = elem.querySelector("img");
		if (img?.src) return img.src;
		const vid = elem.querySelector("video");
		if (vid?.src) return vid.src;
	}

	const contentElem = slide.content?.element;
	if (contentElem) {
		const vid = contentElem.querySelector("video");
		if (vid?.src) return vid.src;
		const img = contentElem.querySelector("img");
		if (img?.src) return img.src;
	}

	return null;
}

export function applyPhotoSwipeDownloadButton(
	lightbox: PhotoSwipeLightbox,
	videoAt?: (index: number) => VideoSlide | null,
	subDir?: string | (() => string | undefined),
): void {
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "download-button",
			order: 8,
			isButton: true,
			tagName: "button",
			html: {
				isCustomSVG: true,
				inner: DOWNLOAD_ICON_SVG,
				outlineID: "pswp__icn-download",
			},
			onClick: (event, el, pswp) => {
				event.preventDefault();
				event.stopPropagation();
				const url = getSlideMediaUrl(pswp, videoAt);
				const targetSubDir =
					typeof subDir === "function" ? subDir() : subDir;
				if (url) {
					void downloadMediaUrl(url, undefined, targetSubDir);
				}
			},
			onInit: (el, pswp) => {
				el.setAttribute("title", "Download");
				el.setAttribute("aria-label", "Download media");
				el.onclick = (event) => {
					event.preventDefault();
					event.stopPropagation();
					const url = getSlideMediaUrl(pswp, videoAt);
					const targetSubDir =
						typeof subDir === "function" ? subDir() : subDir;
					if (url) {
						void downloadMediaUrl(url, undefined, targetSubDir);
					}
				};
			},
		});
	});
}
