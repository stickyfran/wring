<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Item from "$lib/components/ui/item";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import {
		sendNtfyPush,
		syncBackgroundServiceState,
	} from "$lib/platform/notifications";

	const prefs = $derived(getPreferencesSnapshot());

	let testingNtfy = $state(false);

	async function testNtfy() {
		if (!prefs.ntfyTopic.trim()) {
			toast.error("Please enter an ntfy topic first");
			return;
		}
		testingNtfy = true;
		const ok = await sendNtfyPush({
			title: "Open - Test Notification",
			body: "Push notifications via ntfy are working!",
		});
		testingNtfy = false;
		if (ok) {
			toast.success("Test notification sent successfully to ntfy!");
		} else {
			toast.error("Failed to send test notification. Check server URL and topic.");
		}
	}
</script>

<SwitchField
	title="Background connection"
	description="Keep Open active in background on Android to receive notifications when the app is minimized."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => prefs.backgroundService,
		(newValue: boolean) => {
			setPreferences({ backgroundService: newValue })
				.then(() => syncBackgroundServiceState())
				.catch((error) => {
					showErrorToast({ label: "Failed to save preferences", error });
				});
		}
	}
/>

<SwitchField
	title="ntfy / UnifiedPush notifications"
	description="Publish incoming message alerts to an ntfy topic so you can receive push alerts anywhere."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => prefs.ntfyEnabled,
		(newValue: boolean) => {
			setPreferences({ ntfyEnabled: newValue }).catch((error) => {
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
/>

{#if prefs.ntfyEnabled}
	<Item.Root variant="outline" class="flex flex-col items-stretch gap-3 p-4">
		<div class="flex flex-col gap-1">
			<label for="ntfy-server" class="text-xs font-medium text-muted-foreground">
				ntfy Server URL
			</label>
			<Input
				id="ntfy-server"
				type="url"
				placeholder="https://ntfy.sh"
				value={prefs.ntfyServer}
				onchange={(e) => {
					const target = e.currentTarget;
					if (target instanceof HTMLInputElement) {
						void setPreferences({ ntfyServer: target.value || "https://ntfy.sh" });
					}
				}}
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label for="ntfy-topic" class="text-xs font-medium text-muted-foreground">
				ntfy Topic Name
			</label>
			<Input
				id="ntfy-topic"
				type="text"
				placeholder="e.g. my_secret_topic_12345"
				value={prefs.ntfyTopic}
				onchange={(e) => {
					const target = e.currentTarget;
					if (target instanceof HTMLInputElement) {
						void setPreferences({ ntfyTopic: target.value.trim() });
					}
				}}
			/>
		</div>
		<div class="flex justify-end pt-1">
			<Button
				variant="secondary"
				size="sm"
				disabled={testingNtfy || !prefs.ntfyTopic.trim()}
				onclick={testNtfy}
			>
				{testingNtfy ? "Sending..." : "Send test notification"}
			</Button>
		</div>
	</Item.Root>
{/if}
