<script lang="ts">
	import { DownloadSimpleIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import type { Profile } from "$lib/model/users/profiles";
	import { exportProfileData } from "$lib/util/profile-exporter";
	import type { PendingViewabilityChange } from "../profile-state.svelte";
	import EditProfileButton from "./EditProfileButton.svelte";
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";
	import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

	let {
		ourProfile,
		profile,
		changingViewability,
		markBlocked,
		markHidden,
		onFavorite,
	}: {
		ourProfile: boolean;
		profile: Profile | null;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
		markHidden: () => PendingViewabilityChange;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();
</script>

{#if ourProfile || profile}
	<nav
		aria-label="Profile actions"
		class="absolute right-2 flex -translate-y-1/2 flex-row-reverse items-center gap-1.5"
	>
		{#if ourProfile}
			<EditProfileButton />
		{:else if profile}
			<FavoriteProfileToggle
				profileId={profile.profileId}
				isFavorite={profile.isFavorite}
				{onFavorite}
			/>
			<Button
				size="icon-lg"
				variant="secondary"
				aria-label="Download profile data and photos"
				class="size-13 shrink-0 text-primary hover:text-primary-foreground hover:bg-primary"
				onclick={() =>
					exportProfileData({ profileId: profile.profileId, existingProfile: profile })}
			>
				<DownloadSimpleIcon class="size-7" />
			</Button>
			<ProfileActionsMenu
				profileId={profile.profileId}
				{profile}
				blockable={profile.isBlockable !== false}
				{changingViewability}
				{markBlocked}
				{markHidden}
			/>
		{/if}
	</nav>
{/if}
