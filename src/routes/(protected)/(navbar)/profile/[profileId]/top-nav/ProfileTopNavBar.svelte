<script lang="ts">
	import { DownloadSimpleIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import { exportProfileData } from "$lib/util/profile-exporter";
	import EditProfileButton from "./EditProfileButton.svelte";
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";
	import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

	let {
		ourProfileId,
		profile,
		onBlocked,
		onHidden,
		onFavorite,
	}: {
		ourProfileId: number;
		profile: import("$lib/model/users/profiles").Profile;
		onBlocked: () => void;
		onHidden: () => void;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();

	const profileId = $derived(profile.profileId);
	const isOurProfile = $derived(profileId === ourProfileId);
</script>

<nav
	class="absolute right-2 flex -translate-y-1/2 flex-row-reverse items-center gap-1.5"
>
	{#if isOurProfile}
		<EditProfileButton />
	{:else}
		<FavoriteProfileToggle
			{profileId}
			isFavorite={profile.isFavorite}
			{onFavorite}
		/>
		<Button
			size="icon-lg"
			variant="secondary"
			aria-label="Download profile data and photos"
			class="size-12"
			onclick={() => exportProfileData({ profileId, existingProfile: profile })}
		>
			<DownloadSimpleIcon class="size-6" />
		</Button>
		<ProfileActionsMenu {profileId} {profile} {onBlocked} {onHidden} />
	{/if}
</nav>
