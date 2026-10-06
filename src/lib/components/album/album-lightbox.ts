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
import { mediaFailure, remedyFor } from "$lib/platform/media-failure";
import { now } from "$lib/util/clock";
import { proxyMediaUrl } from "$lib/util/media";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import {
	applyPhotoSwipeComponent,
	applyPhotoSwipeDownloadButton,
	openLightbox,
} from "$lib/util/photoswipe";
import { hasNoPlaysLeft, isVideoContent } from "./album";
import NoPlaysLeftSlide from "./NoPlaysLeftSlide.svelte";

export type AlbumSlide = AlbumContentResponse["content"][number] &
	MediaDimensions;

const SLIDES_TTL_MS = 5 * 60 * 1000;
const UNMEASURED: MediaDimensions = { width: 1080, height: 1080 };
const SIZED_ON_LOAD: MediaDimensions = { width: 0, height: 0 };
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

export function saveAlbumsCache(map: Map<number, AlbumSlide[]>) {
	if (typeof window === "undefined" || !window.localStorage) return;
	try {
		const entries = Array.from(map.entries());
		localStorage.setItem(ALBUM_CACHE_KEY, JSON.stringify(entries));
	} catch (e) {
		console.warn("Failed to save album cache to localStorage:", e);
	}
}

export const persistentAlbumCache = loadAlbumsCache();

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

registerAccountCache({
	reset: () => {
		slidesByAlbum.clear();
		persistentAlbumCache.clear();
	},
});

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
	const requestedAt = now();
	try {
		const album = await getAlbumContent(albumId);
		const ready = album.content.filter((item) => !item.processing);
		const persistentExisting = persistentAlbumCache.get(albumId) ?? [];
		const slides = await Promise.all(
			ready.map(async (slide) => {
				const kind = isVideoContent(slide.contentType) ? "video" : "image";
				const existing = persistentExisting.find(
					(s) => s.contentId === slide.contentId,
				);
				let rawUrl = slide.url;
				let rawCover = slide.coverUrl;
				if ((!rawUrl || rawUrl === "") && existing?.url) {
					rawUrl = existing.url;
				}
				if ((!rawCover || rawCover === "") && existing?.coverUrl) {
					rawCover = existing.coverUrl;
				}
				const url = proxyMediaUrl(rawUrl, { as: kind });
				const cover = proxyMediaUrl(rawCover);
				const noPlays =
					isVideoContent(slide.contentType) &&
					(!rawUrl || rawUrl === "");
				const coverUrl = noPlays
					? (cover ?? proxyMediaUrl(slide.thumbUrl))
					: cover;
				const size =
					kind === "image"
						? SIZED_ON_LOAD
						: await (
								coverUrl === null
									? measureVideo(url)
									: measureImage(coverUrl)
							).catch(() => UNMEASURED);
				return { ...slide, url, coverUrl, ...size };
			}),
		);
		const forgottenMeanwhile =
			!isAccountEpochCurrent(epoch) || forgetCountOf(albumId) !== forgetCount;
		if (!forgottenMeanwhile && ready.length === album.content.length) {
			slidesByAlbum.set(albumId, { slides, at: requestedAt });
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

type LightboxItem = { src: string; width: number; height: number };

export function albumPhotoRenewal({
	albumId,
	slides,
	items,
}: {
	albumId: number;
	slides: AlbumSlide[];
	items: LightboxItem[];
}) {
	const renewed = new Set<number>();
	let fresh: Promise<AlbumSlide[]> | null = null;

	return async function renew({
		index,
		refresh,
	}: {
		index: number;
		refresh: () => void;
	}): Promise<void> {
		const slide = slides[index];
		const item = items[index];
		if (slide === undefined || item === undefined) return;
		if (isVideoContent(slide.contentType) || renewed.has(slide.contentId))
			return;
		if (remedyFor(await mediaFailure(item.src)) !== "renew") return;
		renewed.add(slide.contentId);
		fresh ??= (async () => {
			forgetAlbumSlides(albumId);
			return await loadAlbumSlides(albumId);
		})().finally(() => (fresh = null));
		for (const renewedSlide of await fresh) {
			slides.forEach((old, position) => {
				const target = items[position];
				if (old.contentId !== renewedSlide.contentId || !target) return;
				if (isVideoContent(old.contentType)) return;
				target.src = renewedSlide.url;
			});
		}
		refresh();
	};
}

export function openAlbumLightbox({
	albumId,
	slides,
	signal,
	onClosed,
}: {
	albumId: number;
	slides: AlbumSlide[];
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const items = slides.map(({ url, width, height }) => ({
		src: url,
		width,
		height,
	}));
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
	const renew = albumPhotoRenewal({ albumId, slides, items });
	return openLightbox({
		items,
		videoAt,
		configure: (lightbox) => {
			applyPhotoSwipeDownloadButton(lightbox, videoAt);
			lightbox.on("loadError", ({ content }) => {
				void renew({
					index: content.index,
					refresh: () =>
						lightbox.pswp?.refreshSlideContent(content.index),
				});
			});
			applyPhotoSwipeComponent(lightbox, {
				slideAt: (index) => {
					const slide = slides[index];
					return slide !== undefined && hasNoPlaysLeft(slide)
						? slide
						: null;
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
		},
		signal,
		onClosed,
	});
}
