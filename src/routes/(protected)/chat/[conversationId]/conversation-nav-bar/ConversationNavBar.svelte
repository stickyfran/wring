<script lang="ts">
	import { ArrowLeftIcon, DownloadSimpleIcon } from "phosphor-svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { profileMediaUrl } from "$lib/util/media";
	import { exportProfileData } from "$lib/util/profile-exporter";
	import { getConversationState } from "../conversation-state.svelte";
	import ConversationNavBarProfile from "./ConversationNavBarProfile.svelte";

	const conversations = getConversations();
	const conversationState = $derived(getConversationState()());
	const conversation = $derived(
		conversations.get(conversationState.conversationId),
	);
	const isBlocked = $derived(conversation?.data.isBlocked ?? false);

	function exportAllChatData() {
		if (!conversationState.profile) return;
		const extraMedia: { url: string; filename: string }[] = [];
		for (const msg of conversationState.messages) {
			if (msg.type === "Image" && (msg.body as any)?.imageHash) {
				extraMedia.push({
					url: profileMediaUrl({
						mediaHash: (msg.body as any).imageHash,
						size: "full",
					}),
					filename: `chat_${msg.messageId}.jpg`,
				});
			}
		}
		void exportProfileData({
			profileId: conversationState.profile.profileId,
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
>
	<a
		href="/chat"
		aria-label="Back to chats"
		class="flex h-full w-19 items-center justify-center"
	>
		<ArrowLeftIcon size={32} />
	</a>
	{#if conversationState.profile !== null}
		<ConversationNavBarProfile
			profile={conversationState.profile}
			{isBlocked}
		/>
		<Button
			size="icon-lg"
			variant="ghost"
			aria-label="Download profile data and media"
			class="me-3 size-10 shrink-0"
			onclick={exportAllChatData}
		>
			<DownloadSimpleIcon class="size-6" />
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
