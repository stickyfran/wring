<script lang="ts">
	import {
		ChatCircleSlashIcon,
		CheckCircleIcon,
		FunnelIcon,
		PushPinSlashIcon,
		StarIcon,
	} from "phosphor-svelte";

	import * as Empty from "$lib/components/ui/empty";

	let {
		filtered = false,
		tab = "inbox",
	}: { filtered?: boolean; tab?: string } = $props();

	const Icon = $derived(
		filtered
			? FunnelIcon
			: tab === "unread"
				? CheckCircleIcon
				: tab === "favorites"
					? StarIcon
					: tab === "pinned"
						? PushPinSlashIcon
						: ChatCircleSlashIcon,
	);
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon weight="fill" />
		</Empty.Media>
		{#if filtered}
			<Empty.Title>No Results</Empty.Title>
			<Empty.Description>
				No conversations match these filters.
			</Empty.Description>
		{:else if tab === "unread"}
			<Empty.Title>No Unread Messages</Empty.Title>
			<Empty.Description>
				You are all caught up on all conversations.
			</Empty.Description>
		{:else if tab === "favorites"}
			<Empty.Title>No Favorites Yet</Empty.Title>
			<Empty.Description>
				Star profiles or conversations to see them here.
			</Empty.Description>
		{:else if tab === "pinned"}
			<Empty.Title>No Pinned Chats</Empty.Title>
			<Empty.Description>
				Long press or select a conversation to pin it here.
			</Empty.Description>
		{:else}
			<Empty.Title>No Conversations Yet</Empty.Title>
			<Empty.Description>
				Browse <a href="/">Grid</a> to find people to chat with.
			</Empty.Description>
		{/if}
	</Empty.Header>
</Empty.Root>
