<script lang="ts" module>
	import { SvelteMap } from "svelte/reactivity";

	import type { MediaDimensions } from "$lib/util/media-dimensions";

	export type LoadedVideo = {
		src: string;
		loop: boolean;
		width: number;
		height: number;
	};

	const EXPIRING_VIDEO_CACHE_KEY = "open_cached_expiring_videos_v1";

	function loadExpiringVideosCache(): SvelteMap<string, LoadedVideo> {
		const map = new SvelteMap<string, LoadedVideo>();
		if (typeof window === "undefined" || !window.localStorage) return map;
		try {
			const raw = localStorage.getItem(EXPIRING_VIDEO_CACHE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					for (const item of parsed) {
						if (Array.isArray(item) && item.length === 2) {
							map.set(String(item[0]), item[1] as LoadedVideo);
						}
					}
				}
			}
		} catch (e) {
			console.warn(
				"Failed to load expiring video cache from localStorage:",
				e,
			);
		}
		return map;
	}

	function saveExpiringVideosCache(map: Map<string, LoadedVideo>) {
		if (typeof window === "undefined" || !window.localStorage) return;
		try {
			const entries = Array.from(map.entries());
			localStorage.setItem(
				EXPIRING_VIDEO_CACHE_KEY,
				JSON.stringify(entries),
			);
		} catch (e) {
			console.warn(
				"Failed to save expiring video cache to localStorage:",
				e,
			);
		}
	}

	export const expiringVideoCache = loadExpiringVideosCache();
</script>

<script lang="ts">
	import "photoswipe/style.css";
	import { DownloadSimpleIcon, VideoCameraIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

	import { registerAccountCache } from "$lib/api/account-caches";
	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { downloadMediaUrl } from "$lib/util/download";
	import { proxyMediaUrl } from "$lib/util/media";

	registerAccountCache({
		reset: () => {
			expiringVideoCache.clear();
		},
	});
	import {
		measureVideo,
	} from "$lib/util/media-dimensions";
	import {
		applyPhotoSwipeDownloadButton,
		openLightbox,
	} from "$lib/util/photoswipe";
	import type { VideoMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	type VideoBody = VideoMessage["body"];

	type LightboxVideo = { src: string; loop: boolean } & MediaDimensions;

	let {
		conversationId,
		messageId,
		message,
		delivered,
		isOut = false,
	}: {
		conversationId: string;
		messageId: string;
		message: VideoBody;
		delivered: boolean;
		isOut?: boolean;
	} = $props();

	const UNMEASURED: MediaDimensions = { width: 1080, height: 1920 };

	const media = new MessageMediaState();

	let viewsRemaining = $derived(message.viewsRemaining ?? 0);

	const cachedVideo = $derived(expiringVideoCache.get(messageId) ?? null);

	const ownUrl = $derived(
		isOut && message.url !== null
			? proxyMediaUrl(message.url, { as: "video" })
			: null,
	);

	const playable = $derived(delivered && viewsRemaining > 0);

	type PlayerState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; video: LightboxVideo; viewsLeft: number };

	let player = $state<PlayerState>({ status: "idle" });

	type RefetchedVideo = { video: LightboxVideo; viewsLeft: number };

	function play() {
		if (ownUrl) {
			void measureVideo(ownUrl)
				.catch(() => UNMEASURED)
				.then((size) => {
					const vid: LoadedVideo = {
						src: ownUrl,
						loop: message.looping === true,
						width: size.width,
						height: size.height,
					};
					expiringVideoCache.set(messageId, vid);
					saveExpiringVideosCache(expiringVideoCache);
					player = { status: "open", video: vid, viewsLeft: 0 };
				});
		} else {
			player = { status: "loading" };
		}
	}

	function finishPlayback(viewsLeft: number) {
		viewsRemaining = viewsLeft;
		player = { status: "idle" };
	}

	async function refetchVideo(): Promise<RefetchedVideo | null> {
		if (ownUrl) {
			const size = await measureVideo(ownUrl).catch(() => UNMEASURED);
			return {
				video: {
					src: ownUrl,
					loop: message.looping === true,
					width: size.width,
					height: size.height,
				},
				viewsLeft: 0,
			};
		}
		const { message: refetched } = await getSingleMessage({
			conversationId,
			messageId,
		});
		if (refetched.type !== "Video" && refetched.type !== "PrivateVideo") {
			throw new Error(`Expected a video message, got ${refetched.type}`);
		}
		const src = proxyMediaUrl(refetched.body.url, { as: "video" });
		if (src === null) return null;
		const size = await measureVideo(src).catch(() => UNMEASURED);
		const video: LightboxVideo = {
			src,
			loop: refetched.body.looping === true,
			width: size.width,
			height: size.height,
		};
		expiringVideoCache.set(messageId, video);
		saveExpiringVideosCache(expiringVideoCache);
		return {
			video,
			viewsLeft: refetched.body.viewsRemaining ?? 0,
		};
	}

	$effect(() => {
		if (player.status !== "loading") return;
		const controller = new AbortController();
		untrack(refetchVideo)
			.then((refetched) => {
				if (controller.signal.aborted) return;
				if (refetched === null) {
					finishPlayback(0);
					return;
				}
				player = { status: "open", ...refetched };
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				console.error(error);
				showErrorToast({
					label: "Failed to load expiring video",
					error,
				});
				player = { status: "idle" };
			});
		return () => controller.abort();
	});

	$effect(() => {
		if (player.status !== "open") return;
		const { video, viewsLeft } = player;
		const controller = new AbortController();
		const videoSlide = () => ({
			src: video.src,
			poster: null,
			loop: video.loop,
		});
		openLightbox({
			items: [video],
			videoAt: videoSlide,
			configure: (lightbox) => {
				applyPhotoSwipeDownloadButton(lightbox, videoSlide);
			},
			signal: controller.signal,
			onClosed: () => finishPlayback(viewsLeft),
		}).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			console.error(error);
			showErrorToast({ label: "Failed to open expiring video", error });
			finishPlayback(viewsLeft);
		});
		return () => controller.abort();
	});

	const bubbleClass: import("svelte/elements").ClassValue = $derived([
		"relative flex w-fit items-center gap-2 rounded-xl border border-border bg-input px-4 py-3 text-start font-medium",
		media.cornerClass,
		{ "ms-3": !media.clone, "size-full": media.clone },
	]);
</script>

{#snippet bubbleContent()}
	<VideoCameraIcon size={24} weight="fill" class="shrink-0" />
	<span>Expiring video</span>
	{@render media.adornments?.()}
{/snippet}

{#if playable}
	<button
		type="button"
		data-slot="video-message"
		class={[
			bubbleClass,
			{
				"cursor-pointer": player.status === "idle",
				"opacity-50": player.status === "loading",
			},
		]}
		aria-label="Play expiring video"
		disabled={player.status !== "idle"}
		onclick={play}
		{@attach media.attach}
	>
		{@render bubbleContent()}
	</button>
{:else}
	<div
		data-slot={delivered ? "video-message-spent" : "video-message-sending"}
		class={[bubbleClass, { "text-muted-foreground": delivered }]}
		{@attach media.attach}
	>
		{@render bubbleContent()}
		{#if cachedVideo !== null}
			<button
				type="button"
				class="ms-2 flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary/80 cursor-pointer"
				aria-label="Download video"
				onclick={(e) => {
					e.stopPropagation();
					if (cachedVideo) {
						void downloadMediaUrl(cachedVideo.src, undefined, undefined);
					}
				}}
			>
				<DownloadSimpleIcon class="size-4" />
				Download
			</button>
		{/if}
	</div>
{/if}
