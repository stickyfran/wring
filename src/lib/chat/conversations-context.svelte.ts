import { createContext } from "svelte";

import { accountScoped } from "$lib/api/account-caches";
import { showIncomingMessageToast } from "$lib/components/incoming-message-toast/incoming-message-toast-manager";
import { showSystemNotificationForMessage } from "$lib/platform/notifications";
import { announceMessage } from "$lib/push/announce";
import {
	withdrawChatNotification,
	withdrawShownReadChats,
} from "$lib/push/chat-withdrawals";
import { ConversationsState } from "./conversations-state.svelte";

export const [getConversations, setConversations] =
	createContext<ConversationsState>();

export const getOrCreateConversationsState = accountScoped(
	(profileId) =>
		new ConversationsState({
			ourProfileId: profileId,
			onIncomingMessage: ({ message, conversation, inView }) => {
				announceMessage({ message, sender: conversation.data.name });
				if (inView) return;
				showIncomingMessageToast({
					message,
					sender: {
						name: conversation.data.name,
						avatarMediaHash:
							conversation.data.participants[0]
								?.primaryMediaHash ?? null,
					},
					conversationId: conversation.data.conversationId,
				});
				showSystemNotificationForMessage({ message, conversation });
			},
			onConversationRead: (conversationId) =>
				withdrawChatNotification({ conversationId }),
			onFetchedReads: (conversationIds) =>
				void withdrawShownReadChats(conversationIds),
		}),
);
