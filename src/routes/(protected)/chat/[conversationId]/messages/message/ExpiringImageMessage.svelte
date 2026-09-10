<script lang="ts" module>
	type LoadedImage = { url: string; size: MediaDimensions | null };

	const EXPIRING_IMAGE_CACHE_KEY = "open_cached_expiring_images_v1";

	function loadExpiringImagesCache(): Map<string, LoadedImage> {
		const map = new Map<string, LoadedImage>();
		if (typeof window === "undefined" || !window.localStorage) return map;
		try {
			const raw = localStorage.getItem(EXPIRING_IMAGE_CACHE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					for (const item of parsed) {
						if (Array.isArray(item) && item.length === 2) {
							map.set(String(item[0]), item[1] as LoadedImage);
						}
					}
				}
			}
		} catch (e) {
			console.warn(
				"Failed to load expiring image cache from localStorage:",
				e,
			);
		}
		return map;
	}

	function saveExpiringImagesCache(map: Map<string, LoadedImage>) {
		if (typeof window === "undefined" || !window.localStorage) return;
		try {
			const entries = Array.from(map.entries());
			localStorage.setItem(
				EXPIRING_IMAGE_CACHE_KEY,
				JSON.stringify(entries),
			);
		} catch (e) {
			console.warn(
				"Failed to save expiring image cache to localStorage:",
				e,
			);
		}
	}

	const expiringImageCache = loadExpiringImagesCache();
</script>

<script lang="ts">
	import "photoswipe/style.css";
	import { ImagesIcon } from "phosphor-svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import {
		type ExpiringImageMessage,
		expiringImageMessageSchema,
	} from "$lib/model/messaging/messages";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		measureImage,
		type MediaDimensions,
	} from "$lib/util/media-dimensions";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeDownloadButton,
		applyPhotoSwipeErrorUi,
		applyPhotoSwipeViewportSync,
	} from "$lib/util/photoswipe";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		conversationId,
		messageId,
		message,
		isOut,
	}: {
		conversationId: string;
		messageId: string;
		message: ExpiringImageMessage["body"];
		isOut: boolean;
	} = $props();

	const media = new MessageMediaState();

	const className: import("svelte/elements").ClassValue = $derived([
		"relative",
		{ "ms-3": !media.clone, "size-full": media.clone },
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	const bubbleClass: import("svelte/elements").ClassValue = $derived([
		"flex w-50 items-center gap-2 px-4 py-3 text-start font-medium",
		className,
		contentClass,
		"border border-border bg-input",
	]);

	type ImageState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; image: LoadedImage }
		| { status: "expired" };

	let imageState = $state<ImageState>({ status: "idle" });
	let cachedImage = $state<LoadedImage | null>(null);

	$effect(() => {
		cachedImage = expiringImageCache.get(messageId) ?? null;
	});

	const ownUrl = $derived(
		isOut && message.url !== null ? proxyMediaUrl(message.url) : null,
	);

	const viewable = $derived.by(() => {
		if (cachedImage !== null) return true;
		if (isOut) {
			return ownUrl !== null;
		} else {
			return (
				imageState.status !== "expired" &&
				message.viewed !== true &&
				message.viewsRemaining !== 0
			);
		}
	});

	function openImage() {
		const cached = cachedImage ?? expiringImageCache.get(messageId);
		if (cached) {
			cachedImage = cached;
			imageState = { status: "open", image: cached };
		} else {
			imageState = { status: "loading" };
		}
	}

	async function fetchImageUrl(): Promise<string | null> {
		const { body: image } = await getSingleMessage({
			conversationId,
			messageId,
		}).then((res) => expiringImageMessageSchema.parse(res.message));
		return image.url === null ? null : proxyMediaUrl(image.url);
	}

	$effect(() => {
		if (imageState.status !== "loading") return;
		void (async () => {
			try {
				const cached = cachedImage ?? expiringImageCache.get(messageId);
				if (cached) {
					cachedImage = cached;
					imageState = { status: "open", image: cached };
					return;
				}
				const url = ownUrl ?? (await fetchImageUrl());
				if (url === null) {
					imageState = { status: "expired" };
					return;
				}
				const size = await measureImage(url).catch(() => null);
				cachedImage = { url, size };
				expiringImageCache.set(messageId, cachedImage);
				saveExpiringImagesCache(expiringImageCache);
				imageState = { status: "open", image: cachedImage };
			} catch (error) {
				console.error(error);
				showErrorToast({
					label: "Failed to load expiring image",
					error,
				});
				imageState = { status: "idle" };
			}
		})();
	});

	$effect(() => {
		if (imageState.status !== "open") return;
		const { image } = imageState;
		let lightbox: PhotoSwipeLightbox | undefined;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				lightbox = new PhotoSwipeLightbox({
					showHideAnimationType: "fade",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible`,
				});
				applyPhotoSwipeErrorUi(lightbox);
				applyPhotoSwipeViewportSync(lightbox);
				lightbox.addFilter("numItems", () => 1);
				lightbox.addFilter("itemData", () => ({
					src: image.url,
					width: image.size?.width ?? 0,
					height: image.size?.height ?? 0,
				}));
				lightbox.addFilter(
					"useContentPlaceholder",
					(usePlaceholder) => usePlaceholder && image.size !== null,
				);
				applyPhotoSwipeBackGesture(lightbox);
				applyPhotoSwipeDownloadButton(lightbox);
				lightbox.on("closingAnimationEnd", () => {
					imageState = { status: "idle" };
				});
				lightbox.init();
				lightbox.loadAndOpen(0);
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({
					label: "Failed to open expiring image",
					error,
				});
				imageState = { status: "idle" };
			});
		return () => lightbox?.destroy();
	});
</script>

{#snippet bubbleContent(label: string)}
	<ImagesIcon size={24} weight="fill" />
	<span>{label}</span>
	{@render media.adornments?.()}
{/snippet}

{#if viewable}
	<button
		class={[
			bubbleClass,
			{
				"cursor-pointer": imageState.status === "idle",
				"opacity-50": imageState.status === "loading",
			},
		]}
		onclick={openImage}
		disabled={imageState.status !== "idle"}
		{@attach media.attach}
	>
		{@render bubbleContent("View expiring image")}
	</button>
{:else if isOut}
	<div class={[bubbleClass, "text-muted-foreground"]} {@attach media.attach}>
		{@render bubbleContent("Expiring photo")}
	</div>
{:else}
	<div class={["h-12 w-50", className, contentClass]} {@attach media.attach}>
		<LockedMedia
			class={[media.cornerClass, "gap-2 font-medium text-neutral-600"]}
			size="sm"
		>
			Expired image
		</LockedMedia>
		{@render media.adornments?.()}
	</div>
{/if}

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
