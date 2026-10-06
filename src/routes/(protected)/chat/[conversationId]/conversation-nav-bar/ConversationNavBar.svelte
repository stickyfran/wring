<script lang="ts">
	import { ArrowLeftIcon, DownloadSimpleIcon } from "phosphor-svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import { isVideoContent } from "$lib/components/album/album";
	import {
		loadAlbumSlides,
		persistentAlbumCache,
	} from "$lib/components/album/album-lightbox";
	import BackLink from "$lib/components/navigation/BackLink.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { profileMediaUrl, proxyMediaUrl } from "$lib/util/media";
	import { exportProfileData } from "$lib/util/profile-exporter";
	import { topChrome } from "$lib/util/screen-chrome.svelte";
	import { getConversationState } from "../conversation-state.svelte";
	import { expiringImageCache } from "../messages/message/ExpiringImageMessage.svelte";
	import { expiringVideoCache } from "../messages/message/VideoMessage.svelte";
	import ConversationNavBarProfile from "./ConversationNavBarProfile.svelte";

	const conversations = getConversations();
	const conversationState = $derived(getConversationState()());
	const conversation = $derived(
		conversations.get(conversationState.conversationId),
	);
	const isBlocked = $derived(conversation?.data.isBlocked ?? false);

	async function exportAllChatData() {
		if (!conversationState.profile) return;
		const profileId = conversationState.profile.profileId;
		const extraMedia: { url: string; filename: string }[] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seenUrls = new Set<string>();

		function addMedia(rawUrl: string | null | undefined, filename: string) {
			if (!rawUrl || seenUrls.has(rawUrl)) return;
			seenUrls.add(rawUrl);
			extraMedia.push({ url: rawUrl, filename });
		}

		for (const msg of conversationState.messages) {
			if (msg.type === "Image") {
				const bodyWithHash = msg.body as { url?: string | null; imageHash?: string };
				if (msg.body.url) {
					addMedia(
						proxyMediaUrl(msg.body.url),
						`chat_photo_${msg.messageId}.jpg`,
					);
				} else if (bodyWithHash.imageHash) {
					addMedia(
						profileMediaUrl({
							mediaHash: bodyWithHash.imageHash,
							size: "full",
						}),
						`chat_photo_${msg.messageId}.jpg`,
					);
				}
			} else if (msg.type === "ExpiringImage") {
				const cached = expiringImageCache.get(msg.messageId);
				const url =
					cached?.url ??
					(msg.body.url ? proxyMediaUrl(msg.body.url) : null);
				if (url) {
					addMedia(url, `chat_expiring_photo_${msg.messageId}.jpg`);
				}
			} else if (msg.type === "Video" || msg.type === "PrivateVideo") {
				const cached = expiringVideoCache.get(msg.messageId);
				const url =
					cached?.src ??
					(msg.body.url
						? proxyMediaUrl(msg.body.url, { as: "video" })
						: null);
				if (url) {
					addMedia(url, `chat_video_${msg.messageId}.mp4`);
				}
			} else if (
				msg.type === "Album" ||
				msg.type === "ExpiringAlbum" ||
				msg.type === "ExpiringAlbumV2"
			) {
				const albumId = msg.body.albumId;
				try {
					const slides =
						(await loadAlbumSlides(albumId).catch(
							() => persistentAlbumCache.get(albumId) ?? [],
						)) ?? [];
					for (let i = 0; i < slides.length; i++) {
						const slide = slides[i];
						if (!slide) continue;
						const isVid = isVideoContent(slide.contentType);
						if (slide.url) {
							const ext = isVid ? ".mp4" : ".jpg";
							addMedia(
								slide.url,
								`album_${albumId}_item_${i + 1}${ext}`,
							);
						} else if (slide.coverUrl) {
							addMedia(
								slide.coverUrl,
								`album_${albumId}_item_${i + 1}_cover.jpg`,
							);
						}
					}
				} catch (e) {
					console.warn("Failed to load album slides for export:", e);
				}
			}
		}

		void exportProfileData({
			profileId,
			additionalMediaUrls: extraMedia,
		});
	}
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="absolute z-10 h-19 w-full shrink-0"
	bgClass="bg-linear-to-b max-split:from-background split:from-card to-transparent"
	contentClass="flex items-center h-full"
	tag="nav"
	aria-label="Conversation"
	{@attach topChrome}
>
	<BackLink
		href="/chat"
		label="Back to chats"
		class="flex h-full w-19 items-center justify-center"
	>
		<ArrowLeftIcon size={32} />
	</BackLink>
	{#if conversationState.profile !== null}
		<ConversationNavBarProfile
			profile={conversationState.profile}
			{isBlocked}
		/>
		<Button
			size="icon-lg"
			variant="ghost"
			aria-label="Download profile data and media"
			class="me-2 size-12 shrink-0 text-primary hover:bg-primary/20"
			onclick={exportAllChatData}
		>
			<DownloadSimpleIcon class="size-7" />
		</Button>
	{:else if conversationState.error}
		<span class="flex-1">Failed to load conversation</span>
	{:else}
		<div class="flex flex-1 items-center gap-3 py-4 ps-0">
			<Skeleton class="size-avatar rounded-full" />
			<div class="flex flex-col gap-2">
				<Skeleton class="h-4 w-20 rounded-md" />
				<Skeleton class="h-3 w-12 rounded-md" />
			</div>
		</div>
	{/if}
</ProgressiveBlur>
