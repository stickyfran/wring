import { type ComponentProps, mount, unmount } from "svelte";
import type {
	PhotoSwipeEventsMap,
	PhotoSwipeModule,
	PhotoSwipeModuleOption,
} from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import VideoPlayer from "$lib/components/shared/VideoPlayer.svelte";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import { downloadMediaUrl } from "$lib/util/download";
import { openExternalLink } from "$lib/platform/link-opener";
import { isLinuxPlatform } from "$lib/platform/os";
import { canDecodeH264 } from "$lib/platform/video-codecs";
import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
import type { MediaDimensions } from "$lib/util/media-dimensions";
import "./photoswipe.css";

const BROKEN_MEDIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="64" height="64" fill="var(--color-neutral-500)" style="display:block" aria-hidden="true"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16h64a8,8,0,0,0,7.59-5.47l14.83-44.48L163,151.43a8.07,8.07,0,0,0,4.46-4.46l14.62-36.55,44.48-14.83A8,8,0,0,0,232,88V56A16,16,0,0,0,216,40ZM117,152.57a8,8,0,0,0-4.62,4.9L98.23,200H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0l32.84,32.84Zm115-30.84V200a16,16,0,0,1-16,16H137.73a8,8,0,0,1-7.59-10.53l7.94-23.8a8,8,0,0,1,4.61-4.9l35.77-14.31,14.31-35.77a8,8,0,0,1,4.9-4.61l23.8-7.94A8,8,0,0,1,232,121.73Z"/></svg>`;

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

type Failure = Parameters<
	NonNullable<ComponentProps<typeof VideoPlayer>["onfail"]>
>[0];

type Content = PhotoSwipeEventsMap["contentLoad"]["content"];

const failures = new WeakMap<object, Failure>();

const CODECS_GUIDE = "https://opengrind.org/guides/codecs";

function undecodableNotice(): HTMLParagraphElement {
	const notice = document.createElement("p");
	notice.className = "mt-4 max-w-80 text-center text-sm text-neutral-400";
	if (!isLinuxPlatform() || canDecodeH264()) {
		notice.textContent = "This video cannot be played on this system.";
		return notice;
	}
	notice.textContent =
		"Playing this video needs an H.264 decoder, which is not installed on this system. ";
	const guide = document.createElement("a");
	guide.href = CODECS_GUIDE;
	guide.className = "underline";
	guide.textContent = "How to install video codecs";
	guide.onclick = (event) => {
		event.preventDefault();
		openExternalLink(CODECS_GUIDE);
	};
	notice.append(guide);
	return notice;
}

export function applyPhotoSwipeErrorUi(lightbox: PhotoSwipeLightbox): void {
	lightbox.addFilter("contentErrorElement", (element, content) => {
		const failure = failures.get(content);
		if (failure !== undefined) element.dataset.failure = failure.detail;
		element.innerHTML = BROKEN_MEDIA_SVG;
		if (failure?.undecodable === true) {
			element.classList.add("flex", "flex-col", "items-center");
			element.append(undecodableNotice());
			return element;
		}
		element.setAttribute("role", "img");
		element.setAttribute("aria-label", "Media failed to load");
		return element;
	});
}

export function applyPhotoSwipeViewportSync(
	lightbox: PhotoSwipeLightbox,
): void {
	lightbox.on("openingAnimationEnd", () => {
		lightbox.pswp?.updateSize(true);
	});
}

export function applyPhotoSwipeBackGesture(lightbox: PhotoSwipeLightbox): void {
	const onBackGesture = () => {
		lightbox.pswp?.close();
		return false;
	};
	lightbox.on("beforeOpen", () => {
		backGestureEventHandlers.add(onBackGesture);
	});
	lightbox.on("close", () => {
		backGestureEventHandlers.delete(onBackGesture);
	});
}

type VideoSlide = { src: string; poster: string | null; loop?: boolean };

function yieldToInteractiveContent(lightbox: PhotoSwipeLightbox): void {
	lightbox.on("pointerDown", (event) => {
		const { target } = event.originalEvent;
		if (
			target instanceof Element &&
			target.closest("[data-pswp-interactive]") !== null
		)
			event.preventDefault();
	});
	lightbox.on("keydown", (event) => {
		if (event.originalEvent.defaultPrevented) event.preventDefault();
	});
}

export function applyPhotoSwipeComponent<Slide>(
	lightbox: PhotoSwipeLightbox,
	{
		slideAt,
		render,
	}: {
		slideAt: (index: number) => Slide | null;
		render: (mount: {
			target: HTMLElement;
			slide: Slide;
			content: Content;
		}) => Record<string, unknown>;
	},
): void {
	const mounted = new Map<HTMLElement, Record<string, unknown>>();

	lightbox.addFilter("useContentPlaceholder", (usePlaceholder, content) =>
		slideAt(content.index) === null ? usePlaceholder : false,
	);

	lightbox.on("contentLoad", (event) => {
		const { content } = event;
		const slide = slideAt(content.index);
		if (slide === null) return;
		event.preventDefault();
		const element = document.createElement("div");
		element.className = "size-full";
		content.element = element;
		content.state = "loading";
		mounted.set(element, render({ target: element, slide, content }));
	});

	lightbox.on("contentDestroy", ({ content }) => {
		const { element } = content;
		if (!element) return;
		const component = mounted.get(element);
		if (component === undefined) return;
		mounted.delete(element);
		void unmount(component);
	});

	lightbox.on("destroy", () => {
		for (const component of mounted.values()) void unmount(component);
		mounted.clear();
	});
}

export function applyPhotoSwipeVideo(
	lightbox: PhotoSwipeLightbox,
	videoAt: (index: number) => VideoSlide | null,
): void {
	yieldToInteractiveContent(lightbox);

	applyPhotoSwipeComponent(lightbox, {
		slideAt: videoAt,
		render: ({ target, slide, content }) =>
			mount(VideoPlayer, {
				target,
				props: {
					...slide,
					onready: () => content.onLoaded(),
					onfail: (failure: Failure) => {
						failures.set(content, failure);
						console.error(
							`[video] slide ${content.index} failed: ${failure.detail}`,
						);
						content.onError();
					},
				},
			}),
	});

	lightbox.on("contentActivate", ({ content }) => {
		content.element
			?.querySelector("video")
			?.play()
			.catch(() => {});
	});

	lightbox.on("contentDeactivate", ({ content }) => {
		content.element?.querySelector("video")?.pause();
	});
}

export type LightboxItem = { src: string } & MediaDimensions;

export async function openLightbox({
	items,
	videoAt,
	configure,
	signal,
	onClosed,
}: {
	items: LightboxItem[];
	videoAt?: (index: number) => VideoSlide | null;
	configure?: (lightbox: PhotoSwipeLightbox) => void;
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const { default: Lightbox } = await import("photoswipe/lightbox");
	if (signal.aborted) return;
	const lightbox = new Lightbox({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: "pswp--buttons-visible",
	});
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeViewportSync(lightbox);
	lightbox.addFilter("numItems", () => items.length);
	lightbox.addFilter("itemData", (itemData, index) => {
		const item = items[index];
		if (item === undefined) return itemData;
		return { src: item.src, width: item.width, height: item.height };
	});
	applyPhotoSwipeLoadedSize(lightbox);
	applyPhotoSwipeBackGesture(lightbox);
	if (videoAt !== undefined) applyPhotoSwipeVideo(lightbox, videoAt);
	configure?.(lightbox);
	lightbox.on("closingAnimationEnd", onClosed);
	signal.addEventListener("abort", () => lightbox.destroy(), { once: true });
	lightbox.init();
	lightbox.loadAndOpen(0);
}

export function applyPhotoSwipeThumbDimensions(
	lightbox: PhotoSwipeLightbox,
): void {
	lightbox.addFilter("itemData", (itemData) => {
		const img = itemData.element?.querySelector("img");
		if (img?.naturalWidth && img.src !== TRANSPARENT_PIXEL) {
			itemData.width = img.naturalWidth;
			itemData.height = img.naturalHeight;
		}
		return itemData;
	});
	applyPhotoSwipeLoadedSize(lightbox);
}

export function applyPhotoSwipeLoadedSize(lightbox: PhotoSwipeLightbox): void {
	lightbox.addFilter(
		"useContentPlaceholder",
		(usePlaceholder, content) => usePlaceholder && content.width > 0,
	);
	lightbox.on("loadComplete", ({ slide, content }) => {
		const image = content.element;
		if (
			content.width > 0 ||
			!(image instanceof HTMLImageElement) ||
			image.naturalWidth === 0
		)
			return;
		content.width = slide.width = image.naturalWidth;
		content.height = slide.height = image.naturalHeight;
		slide.currentResolution = 0;
		slide.calculateSize();
		slide.zoomAndPanToInitial();
		slide.applyCurrentZoomPan();
		slide.updateContentSize(true);
	});
}

type Listener = () => void;

const busyLightboxes = new Set<PhotoSwipeLightbox>();
const openingListeners = new Set<Listener>();
const idleListeners = new Set<Listener>();

export function isPhotoSwipeBusy(): boolean {
	return busyLightboxes.size > 0;
}

export function onPhotoSwipeOpening(listener: Listener): () => void {
	openingListeners.add(listener);
	return () => {
		openingListeners.delete(listener);
	};
}

export function onPhotoSwipeIdle(listener: Listener): () => void {
	idleListeners.add(listener);
	return () => {
		idleListeners.delete(listener);
	};
}

function notify(listeners: Set<Listener>): void {
	for (const listener of [...listeners]) listener();
}

function release(lightbox: PhotoSwipeLightbox): void {
	if (busyLightboxes.delete(lightbox) && busyLightboxes.size === 0)
		notify(idleListeners);
}

function specialKeyUsed(event: MouseEvent): boolean {
	return (
		event.button === 1 ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	);
}

function isCoreLoader(
	option: PhotoSwipeModuleOption | undefined,
): option is () => Promise<PhotoSwipeModule> {
	return typeof option === "function" && !option.prototype?.goTo;
}

export function applyPhotoSwipeOpenTracking(
	lightbox: PhotoSwipeLightbox,
): () => void {
	const { gallery, pswpModule } = lightbox.options;
	if (!(gallery instanceof HTMLElement))
		throw new TypeError("PhotoSwipe open tracking needs a gallery element");

	const trackOpening = (event: MouseEvent) => {
		if (specialKeyUsed(event) || window.pswp !== undefined) return;
		const index = lightbox.applyFilters(
			"clickedIndex",
			lightbox.getClickedIndex(event),
			event,
			lightbox,
		);
		if (index < 0) return;
		busyLightboxes.add(lightbox);
		notify(openingListeners);
	};
	gallery.addEventListener("click", trackOpening, true);

	if (isCoreLoader(pswpModule))
		lightbox.options.pswpModule = () =>
			pswpModule().catch((error: unknown) => {
				release(lightbox);
				throw error;
			});

	lightbox.on("destroy", () => {
		release(lightbox);
	});

	return () => {
		gallery.removeEventListener("click", trackOpening, true);
		release(lightbox);
	};
}
