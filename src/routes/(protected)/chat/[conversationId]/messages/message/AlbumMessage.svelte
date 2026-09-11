<script lang="ts" module>
	import type { AlbumContentResponse } from "$lib/api/messaging/albums";
	import type { MediaDimensions } from "$lib/util/media-dimensions";

	type LoadedAlbum = AlbumContentResponse & {
		content: (AlbumContentResponse["content"][number] & MediaDimensions)[];
	};

	const ALBUM_CACHE_KEY = "open_cached_albums_v1";

	function loadAlbumsCache(): Map<number, LoadedAlbum> {
		const map = new Map<number, LoadedAlbum>();
		if (typeof window === "undefined" || !window.localStorage) return map;
		try {
			const raw = localStorage.getItem(ALBUM_CACHE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					for (const item of parsed) {
						if (Array.isArray(item) && item.length === 2) {
							map.set(Number(item[0]), item[1] as LoadedAlbum);
						}
					}
				}
			}
		} catch (e) {
			console.warn("Failed to load album cache from localStorage:", e);
		}
		return map;
	}

	function saveAlbumsCache(map: Map<number, LoadedAlbum>) {
		if (typeof window === "undefined" || !window.localStorage) return;
		try {
			const entries = Array.from(map.entries());
			localStorage.setItem(ALBUM_CACHE_KEY, JSON.stringify(entries));
		} catch (e) {
			console.warn("Failed to save album cache to localStorage:", e);
		}
	}

	const albumContentCache = loadAlbumsCache();
</script>

<script lang="ts">
	import "photoswipe/style.css";
	import { ImagesIcon, LockSimpleIcon, VideoIcon } from "phosphor-svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getAlbumContent } from "$lib/api/messaging/albums";
	import { albumShares } from "$lib/chat/album-shares.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { now } from "$lib/util/clock";
	import { proxyMediaUrl } from "$lib/util/media";
	import { measureImage, measureVideo } from "$lib/util/media-dimensions";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeDownloadButton,
		applyPhotoSwipeErrorUi,
		applyPhotoSwipeVideo,
		applyPhotoSwipeViewportSync,
	} from "$lib/util/photoswipe";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	const ALBUM_MEMO_TTL_MS = 10 * 60 * 1000;

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();
	const conversationState = $derived(getConversationState()());
	const peerProfileId = $derived(
		conversationState.profile?.profileId ?? null,
	);
	const isViewable = $derived.by(() => {
		if (peerProfileId === null) return message.isViewable;
		return (
			albumShares.isSharedWith({
				albumId: message.albumId,
				profileId: peerProfileId,
			}) ?? message.isViewable
		);
	});

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto relative",
		{
			"ring ring-accent": message.hasUnseenContent,
			"w-2/5 min-w-35 max-w-60 ms-3": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	type AlbumState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; album: LoadedAlbum };

	let albumState = $state<AlbumState>({ status: "idle" });

	const cachedCover = $derived.by(() => {
		if (message.coverUrl) return proxyMediaUrl(message.coverUrl);
		const cached = albumContentCache.get(message.albumId);
		if (cached && cached.content.length > 0) {
			const first = cached.content[0];
			if (first) {
				return first.coverUrl || first.url;
			}
		}
		return null;
	});

	function openAlbum() {
		const cached = albumContentCache.get(message.albumId);
		if (cached && !isViewable) {
			albumState = { status: "open", album: cached };
		} else {
			albumState = { status: "loading" };
		}
	}

	$effect(() => {
		if (albumState.status !== "loading") return;
		(async () => {
			try {
				const album = await getAlbumContent(message.albumId);
				const loaded = {
					...album,
					content: await Promise.all(
						album.content.map(async (slide) => {
							const kind = slide.contentType.startsWith("video/")
								? "video"
								: "image";
							const url = proxyMediaUrl(slide.url, { as: kind });
							const coverUrl = proxyMediaUrl(slide.coverUrl);
							const measurable = { video: coverUrl, image: url }[
								kind
							];
							const dims =
								(measurable === null
									? await measureVideo(url).catch(() => ({
											width: 0,
											height: 0,
										}))
									: await measureImage(measurable).catch(
											() => ({
												width: 0,
												height: 0,
											}),
										)) ?? { width: 0, height: 0 };
							return {
								...slide,
								url,
								coverUrl,
								width: dims.width,
								height: dims.height,
							};
						}),
					),
				};
				albumContentCache.set(message.albumId, loaded);
				saveAlbumsCache(albumContentCache);
				albumState = { status: "open", album: loaded };
			} catch (error) {
				console.error("Album fetch error:", error);
				const cached = albumContentCache.get(message.albumId);
				if (cached) {
					albumState = { status: "open", album: cached };
					return;
				}
				if (!isViewable) {
					showErrorToast({
						label: "Album is no longer shared by sender",
						error,
					});
				} else {
					showErrorToast({
						label: "Failed to load album content",
						error,
					});
				}
				albumState = { status: "idle" };
			}
		})();
	});

	$effect(() => {
		if (albumState.status !== "open") return;
		const { album } = albumState;
		let lightbox: PhotoSwipeLightbox | undefined;
		let canceled = false;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				if (canceled) return;
				lightbox = new PhotoSwipeLightbox({
					showHideAnimationType: "fade",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible`,
				});
				applyPhotoSwipeErrorUi(lightbox);
				applyPhotoSwipeViewportSync(lightbox);
				lightbox.addFilter("numItems", () => album.content.length);
				lightbox.addFilter("itemData", (itemData, index) => {
					const slide = album.content[index];
					if (slide === undefined) return itemData;
					return {
						src: slide.url,
						width: slide.width || 0,
						height: slide.height || 0,
					};
				});
				applyPhotoSwipeBackGesture(lightbox);
				const videoAt = (index: number) => {
					const slide = album.content[index];
					if (!slide?.contentType.startsWith("video/")) return null;
					return { src: slide.url, poster: slide.coverUrl };
				};
				applyPhotoSwipeVideo(lightbox, videoAt);
				applyPhotoSwipeDownloadButton(lightbox, videoAt, () =>
					peerProfileId ? String(peerProfileId) : undefined,
				);
				lightbox.on("closingAnimationEnd", () => {
					albumState = { status: "idle" };
				});
				lightbox.init();
				lightbox.loadAndOpen(0);
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({ label: "Failed to open album", error });
				albumState = { status: "idle" };
			});
		return () => {
			canceled = true;
			lightbox?.destroy();
			lightbox = undefined;
		};
	});
</script>

<button
	class={[
		className,
		contentClass,
		{
			"cursor-pointer": albumState.status === "idle",
			"opacity-75": !isViewable,
			"opacity-50": albumState.status === "loading",
		},
	]}
	aria-label="Open album"
	onclick={openAlbum}
	disabled={albumState.status !== "idle"}
	{@attach media.attach}
>
	{#if cachedCover}
		<MediaImage
			loading="lazy"
			src={cachedCover}
			class="absolute top-0 left-0 h-full w-full rounded-[inherit]"
			imgClass="bg-card-foreground/10"
		/>
	{:else}
		<LockedMedia class={media.cornerClass} />
	{/if}
	<div class={["@container absolute top-0 left-0 size-full", contentClass]}>
		{#if !isViewable}
			<div
				class="absolute top-2 right-2 z-2 flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-2xs font-semibold text-white shadow-md backdrop-blur-sm"
			>
				<LockSimpleIcon weight="bold" class="size-3" />
				Unshared
			</div>
		{/if}
		<div
			class="absolute bottom-1/5 left-1/2 flex -translate-x-1/2 items-center gap-1 px-2 py-0.5 *:aspect-square *:w-[20cqw] *:rounded-full *:bg-card *:p-2"
		>
			{#if message.hasPhoto}
				<div>
					<ImagesIcon
						width="100%"
						height="auto"
						weight="fill"
						color="var(--color-neutral-200)"
					/>
				</div>
			{/if}
			{#if message.hasVideo}
				<div>
					<VideoIcon
						width="100%"
						height="auto"
						weight="fill"
						color="var(--color-neutral-200)"
					/>
				</div>
			{/if}
		</div>
	</div>
	{@render media.adornments?.()}
</button>

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
