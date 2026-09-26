import { mount } from "svelte";

import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import {
	type AlbumContentResponse,
	getAlbumContent,
} from "$lib/api/messaging/albums";
import { now } from "$lib/util/clock";
import { proxyMediaUrl } from "$lib/util/media";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeComponent,
	applyPhotoSwipeDownloadButton,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeVideo,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";
import { hasNoPlaysLeft, isVideoContent } from "./album";
import NoPlaysLeftSlide from "./NoPlaysLeftSlide.svelte";

export type AlbumSlide = AlbumContentResponse["content"][number] &
	MediaDimensions;

const SLIDES_TTL_MS = 10 * 60 * 1000;
const UNMEASURED: MediaDimensions = { width: 1080, height: 1080 };
const ALBUM_CACHE_KEY = "open_cached_albums_v1";

function loadAlbumsCache(): Map<number, AlbumSlide[]> {
	const map = new Map<number, AlbumSlide[]>();
	if (typeof window === "undefined" || !window.localStorage) return map;
	try {
		const raw = localStorage.getItem(ALBUM_CACHE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (Array.isArray(item) && item.length === 2) {
						map.set(Number(item[0]), item[1] as AlbumSlide[]);
					}
				}
			}
		}
	} catch (e) {
		console.warn("Failed to load album cache from localStorage:", e);
	}
	return map;
}

function saveAlbumsCache(map: Map<number, AlbumSlide[]>) {
	if (typeof window === "undefined" || !window.localStorage) return;
	try {
		const entries = Array.from(map.entries());
		localStorage.setItem(ALBUM_CACHE_KEY, JSON.stringify(entries));
	} catch (e) {
		console.warn("Failed to save album cache to localStorage:", e);
	}
}

const persistentAlbumCache = loadAlbumsCache();

export function hasCachedAlbum(albumId: number): boolean {
	return persistentAlbumCache.has(albumId) || slidesByAlbum.has(albumId);
}

export function getCachedAlbumCover(albumId: number): string | null {
	const slides =
		slidesByAlbum.get(albumId)?.slides ?? persistentAlbumCache.get(albumId);
	if (slides && slides.length > 0) {
		const first = slides[0];
		if (first) {
			return first.coverUrl || first.url;
		}
	}
	return null;
}

const slidesByAlbum = new Map<number, { slides: AlbumSlide[]; at: number }>();
const forgetCountByAlbum = new Map<number, number>();

registerAccountCache({ reset: () => slidesByAlbum.clear() });

function forgetCountOf(albumId: number): number {
	return forgetCountByAlbum.get(albumId) ?? 0;
}

export function forgetAlbumSlides(albumId: number): void {
	slidesByAlbum.delete(albumId);
	forgetCountByAlbum.set(albumId, forgetCountOf(albumId) + 1);
}

export async function loadAlbumSlides(albumId: number): Promise<AlbumSlide[]> {
	const cached = slidesByAlbum.get(albumId);
	if (cached !== undefined && now() - cached.at < SLIDES_TTL_MS) {
		return cached.slides;
	}
	const epoch = accountEpoch();
	const forgetCount = forgetCountOf(albumId);
	try {
		const album = await getAlbumContent(albumId);
		const ready = album.content.filter((item) => !item.processing);
		const slides = await Promise.all(
			ready.map(async (slide) => {
				const kind = isVideoContent(slide.contentType) ? "video" : "image";
				const url = proxyMediaUrl(slide.url, { as: kind });
				const cover = proxyMediaUrl(slide.coverUrl);
				const coverUrl = hasNoPlaysLeft(slide)
					? (cover ?? proxyMediaUrl(slide.thumbUrl))
					: cover;
				const measurable = { video: coverUrl, image: url }[kind];
				const size = await (
					measurable === null
						? measureVideo(url)
						: measureImage(measurable)
				).catch(() => UNMEASURED);
				return { ...slide, url, coverUrl, ...size };
			}),
		);
		const forgottenMeanwhile =
			!isAccountEpochCurrent(epoch) || forgetCountOf(albumId) !== forgetCount;
		if (!forgottenMeanwhile && ready.length === album.content.length) {
			slidesByAlbum.set(albumId, { slides, at: now() });
			persistentAlbumCache.set(albumId, slides);
			saveAlbumsCache(persistentAlbumCache);
		}
		return slides;
	} catch (error) {
		const persistent = persistentAlbumCache.get(albumId);
		if (persistent && persistent.length > 0) {
			return persistent;
		}
		throw error;
	}
}

export async function openAlbumLightbox({
	slides,
	signal,
	onClosed,
}: {
	slides: AlbumSlide[];
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
	if (signal.aborted) return;
	const lightbox = new PhotoSwipeLightbox({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: "pswp--buttons-visible",
	});
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeViewportSync(lightbox);
	lightbox.addFilter("numItems", () => slides.length);
	lightbox.addFilter("itemData", (itemData, index) => {
		const slide = slides[index];
		if (slide === undefined) return itemData;
		return { src: slide.url, width: slide.width, height: slide.height };
	});
	applyPhotoSwipeBackGesture(lightbox);
	const videoAt = (index: number) => {
		const slide = slides[index];
		if (
			slide === undefined ||
			!isVideoContent(slide.contentType) ||
			hasNoPlaysLeft(slide)
		)
			return null;
		return { src: slide.url, poster: slide.coverUrl };
	};
	applyPhotoSwipeVideo(lightbox, videoAt);
	applyPhotoSwipeDownloadButton(lightbox, videoAt);
	applyPhotoSwipeComponent(lightbox, {
		slideAt: (index) => {
			const slide = slides[index];
			return slide !== undefined && hasNoPlaysLeft(slide) ? slide : null;
		},
		render: ({ target, slide, content }) => {
			const locked = mount(NoPlaysLeftSlide, {
				target,
				props: { still: slide.coverUrl },
			});
			content.onLoaded();
			return locked;
		},
	});
	lightbox.on("closingAnimationEnd", onClosed);
	signal.addEventListener("abort", () => lightbox.destroy(), { once: true });
	lightbox.init();
	lightbox.loadAndOpen(0);
}
