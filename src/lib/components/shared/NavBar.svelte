<script lang="ts">
	import { page } from "$app/state";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
	import ChatDotsIcon from "phosphor-svelte/lib/ChatDotsIcon";
	import DotsNineIcon from "phosphor-svelte/lib/DotsNineIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import PushPinIcon from "phosphor-svelte/lib/PushPinIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import { untrack } from "svelte";

	import { getProfile } from "$lib/api/users/profiles";
	import { getOrCreateConversationsState } from "$lib/chat/conversations-context.svelte";
	import BrokenUserAvatar from "$lib/components/profile/BrokenUserAvatar.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { tabsListVariants } from "$lib/components/ui/tabs";
	import { getTapsState } from "$lib/interest/taps-state.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const myProfilePhotos = untrack(() =>
		getProfile(ourProfileId).then((profile) => profile.medias),
	);

	const conversations = untrack(() =>
		getOrCreateConversationsState(ourProfileId),
	);
	const hasUnreadInbox = $derived(conversations.hasUnreadInbox);
	const hasUnreadAll = $derived(conversations.hasUnreadAll);
	const hasUnreadFavorites = $derived(conversations.hasUnreadFavorites);
	const hasUnreadPinned = $derived(conversations.hasUnreadPinned);

	const taps = untrack(() => getTapsState(ourProfileId));
	const hasUnseenTaps = $derived(taps.hasUnseen);

	const isChatRoute = $derived(
		page.route.id?.startsWith("/(protected)/chat") ?? false,
	);
	const currentChatTab = $derived(page.url.searchParams.get("tab") ?? "inbox");
</script>

<ProgressiveBlur
	direction="bottomToTop"
	tag="nav"
	class="fixed bottom-0 z-50 w-full pt-2 pb-fixed-nav"
	bgClass="bg-linear-to-t from-background to-transparent"
	contentClass="overflow-auto no-scrollbar left-1/2 -translate-x-1/2 m-auto flex justify-center gap-2 px-2"
>
	<div
		class={[
			tabsListVariants({ variant: "default" }),
			"links shrink-0 [&>a>svg]:size-5!",
		]}
	>
		<a
			href="/"
			data-active={page.route.id === "/(protected)/(navbar)/(root)"}
			onclick={(e) => {
				if (page.route.id === "/(protected)/(navbar)/(root)") {
					e.preventDefault();
				}
			}}
		>
			<DotsNineIcon weight="fill" />
			Browse
		</a>
		<a
			href="/interest"
			data-active={page.route.id?.startsWith(
				"/(protected)/(navbar)/interest",
			)}
		>
			<FireIcon weight="fill" />
			Interest
			{#if hasUnseenTaps}
				<Badge
					class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
				/>
			{/if}
		</a>
		<a
			href="/chat"
			data-active={isChatRoute && currentChatTab === "inbox"}
		>
			<ChatCircleIcon weight="fill" />
			Inbox
			{#if hasUnreadInbox}
				<Badge
					class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
				/>
			{/if}
		</a>
		<a
			href="/chat?tab=unread"
			data-active={isChatRoute && currentChatTab === "unread"}
		>
			<ChatDotsIcon weight="fill" />
			Unread
			{#if hasUnreadAll}
				<Badge
					class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
				/>
			{/if}
		</a>
		<a
			href="/chat?tab=favorites"
			data-active={isChatRoute && currentChatTab === "favorites"}
		>
			<StarIcon weight="fill" />
			Fav
			{#if hasUnreadFavorites}
				<Badge
					class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
				/>
			{/if}
		</a>
		<a
			href="/chat?tab=pinned"
			data-active={isChatRoute && currentChatTab === "pinned"}
		>
			<PushPinIcon weight="fill" />
			Pin
			{#if hasUnreadPinned}
				<Badge
					class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
				/>
			{/if}
		</a>
	</div>
	<a
		href="/settings"
		aria-label="Me"
		class={[
			"flex size-14 shrink-0 rounded-full border bg-muted p-1",
			{
				"border-2 border-accent":
					page.route.id === "/(protected)/(navbar)/settings/(me)",
				"border-border":
					page.route.id !== "/(protected)/(navbar)/settings/(me)",
			},
		]}
	>
		{#await myProfilePhotos then photos}
			{@const mainPhoto = photos[0] as { mediaHash: string } | undefined}
			<UserAvatar
				mediaHash={mainPhoto?.mediaHash ?? null}
				class="size-full *:rounded-full"
				size="lg"
			/>
		{:catch}
			<BrokenUserAvatar />
		{/await}
	</a>
</ProgressiveBlur>

<style lang="postcss">
	@reference "$layout";

	.links a {
		@apply relative inline-flex h-[calc(100%-1px)] flex-1 flex-col items-center justify-center gap-0.5 rounded-full border border-transparent! px-3 py-1 text-xs whitespace-nowrap text-foreground/60 group-data-vertical/tabs:rounded-2xl group-data-vertical/tabs:px-3 group-data-vertical/tabs:py-1.5 hover:bg-input/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-input/20 data-active:font-medium data-active:text-foreground dark:data-active:border-input dark:data-active:text-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4;
	}
</style>
