<script lang="ts">
	import { ImagesIcon, LockSimpleIcon, VideoIcon } from "phosphor-svelte";

	import { albumShares } from "$lib/chat/album-shares.svelte";
	import {
		getCachedAlbumCover,
		hasCachedAlbum,
		loadAlbumSlides,
	} from "$lib/components/album/album-lightbox";
	import AlbumPreview from "$lib/components/album/AlbumPreview.svelte";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import LockedMedia from "./LockedMedia.svelte";
	import { mediaRenewal } from "./media-renewal";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();
	const renewMedia = mediaRenewal();
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

	const isCached = $derived(hasCachedAlbum(message.albumId));
	const canOpen = $derived(isViewable || isCached);
	const coverUrl = $derived(
		message.coverUrl ?? getCachedAlbumCover(message.albumId),
	);

	$effect(() => {
		if (isViewable && !isCached) {
			loadAlbumSlides(message.albumId).catch(() => {});
		}
	});

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto",
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
</script>

{#if canOpen}
	<AlbumPreview
		albumId={message.albumId}
		{coverUrl}
		hasPhoto={message.hasPhoto}
		hasVideo={message.hasVideo}
		class={[className, { "opacity-75": !isViewable }]}
		{contentClass}
		attach={media.attach}
		onexpired={renewMedia}
	>
		{#if !isViewable}
			<div
				class="absolute top-2 right-2 z-2 flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-2xs font-semibold text-white shadow-md"
			>
				<LockSimpleIcon weight="bold" class="size-3" />
				Unshared
			</div>
		{/if}
		{@render media.adornments?.()}
	</AlbumPreview>
{:else}
	<div
		data-slot="locked-album"
		class={[className, contentClass, "relative"]}
		{@attach media.attach}
	>
		<LockedMedia class={media.cornerClass} />
		<div class={["@container absolute top-0 left-0 size-full", contentClass]}>
			<div
				class="absolute top-2 right-2 z-2 flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-2xs font-semibold text-white shadow-md"
			>
				<LockSimpleIcon weight="bold" class="size-3" />
				Unshared
			</div>
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
	</div>
{/if}
