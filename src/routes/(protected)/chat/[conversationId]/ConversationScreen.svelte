<script lang="ts">
	import { untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import * as Card from "$lib/components/ui/card";
	import { setScreenLeaving } from "$lib/platform/back-gesture-event.svelte";
	import type { MessageDraft } from "$lib/model/messaging/messages";
	import ChatNavBar from "./conversation-nav-bar/ConversationNavBar.svelte";
	import {
		ConversationState,
		setConversationState,
	} from "./conversation-state.svelte";
	import MessageComposer from "./message-composer/MessageComposer.svelte";
	import ConversationMessages from "./messages/ConversationMessages.svelte";

	let {
		conversationId,
		ourProfileId,
		leaving = false,
	}: {
		conversationId: string;
		ourProfileId: number;
		leaving?: boolean;
	} = $props();

	setScreenLeaving(() => leaving);

	const conversations = getConversations();

	let conversationState = $state(
		untrack(
			() =>
				new ConversationState({
					conversationId,
					ourProfileId,
					conversations,
				}),
		),
	);

	$effect(() => {
		const id = conversationId;
		const profileId = ourProfileId;
		if (leaving) return;

		const state = untrack(() => {
			if (
				id !== conversationState.conversationId ||
				profileId !== conversationState.ourProfileId ||
				conversationState.destroyed
			) {
				const next = new ConversationState({
					conversationId: id,
					ourProfileId: profileId,
					conversations,
				});
				conversationState = next;
				return next;
			}
			return conversationState;
		});

		return () => state.destroy();
	});

	setConversationState(() => conversationState);

	const conversation = $derived(conversations.get(conversationId));
	const isBlocked = $derived(conversation?.data.isBlocked ?? false);

	let composerHeight = $state(0);
</script>

<ChatNavBar />
<Card.Content class="relative flex min-h-0 flex-1 flex-col p-0">
	<ConversationMessages {composerHeight} />
	{#if isBlocked}
		<div
			class="border-t border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm font-medium text-destructive"
		>
			This conversation is unavailable because this user blocked you or
			deleted their account.
		</div>
	{:else}
		<MessageComposer
			conversationId={conversationState.conversationId}
			onSend={(drafts: MessageDraft[]) => conversationState.send(drafts)}
			disabled={conversationState.loading || conversationState.error !== null}
			replyTo={conversationState.replyTo}
			onCancelReply={() => conversationState.clearReplyTo()}
			bind:height={composerHeight}
		/>
	{/if}
</Card.Content>
