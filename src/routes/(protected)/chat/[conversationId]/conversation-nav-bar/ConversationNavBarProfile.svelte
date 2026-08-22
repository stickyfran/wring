<script lang="ts">
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileStatusIndicator from "$lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import * as Card from "$lib/components/ui/card";
	import type { ConversationProfile } from "../conversation-state.svelte";

	let {
		profile,
		isBlocked = false,
	}: {
		profile: ConversationProfile;
		isBlocked?: boolean;
	} = $props();
</script>

<a href="/profile/{profile.profileId}" class="flex-1 py-4 ps-0 pe-4">
	<Card.Header class="flex items-center gap-4 px-0">
		<Avatar.Root
			class={[
				"size-avatar after:rounded-full",
				isBlocked && "ring-2 ring-red-500 rounded-full ring-offset-1",
			]}
		>
			<UserAvatar
				mediaHash={profile.mediaHash ?? null}
				class="size-full *:rounded-full"
				size="lg"
			/>
		</Avatar.Root>
		<div class="flex min-w-0 flex-col">
			<Card.Title
				class={[
					"flex min-w-0 items-center gap-1",
					{ "text-muted-foreground": !profile.name },
				]}
			>
				<ProfileStatusIndicator onlineUntil={profile.onlineUntil} />
				<DisplayName
					name={profile.name}
					class={["truncate", isBlocked && "text-red-500 font-bold dark:text-red-400"]}
				/>
				{#if isBlocked}
					<span
						class="rounded bg-destructive/20 px-1 py-0.2 text-[10px] font-bold text-destructive uppercase tracking-wider"
					>
						Blocked
					</span>
				{/if}
			</Card.Title>
			{#if isBlocked}
				<Card.Description class="truncate text-destructive font-medium">
					This user blocked you or chat is unavailable
				</Card.Description>
			{:else if profile.distance === null}
				<Card.Description class="truncate"
					>Distance unknown</Card.Description
				>
			{:else}
				<Card.Description class="truncate">
					<DistanceFormatted distance={profile.distance} />
				</Card.Description>
			{/if}
		</div>
	</Card.Header>
</a>
