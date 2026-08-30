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
	import { isAndroidPlatform } from "$lib/platform/os";
	import {
		openNotificationSettings,
		requestIgnoreBatteryOptimizations,
		requestSystemNotificationPermission,
		sendNtfyPush,
		showSystemNotification,
		syncBackgroundServiceState,
	} from "$lib/platform/notifications";

	const prefs = $derived(getPreferencesSnapshot());

	let testingNtfy = $state(false);

	function testLocalNotification() {
		requestSystemNotificationPermission();
		showSystemNotification({
			title: "Open - Test Notification",
			body: "Local notifications and sound/vibration are working!",
		});
		toast.success("Test notification triggered!");
	}

	async function testNtfy() {
		if (!prefs.ntfyTopic.trim()) {
			toast.error("Please enter an ntfy topic first");
			return;
		}
		testingNtfy = true;
		const ok = await sendNtfyPush({
			title: "Open - Test Push Notification",
			body: "Push notifications via ntfy are working!",
		});
		testingNtfy = false;
		if (ok) {
			toast.success("Test notification sent successfully to ntfy!");
		} else {
			toast.error(
				"Failed to send test notification. Check server URL and topic.",
			);
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
					showErrorToast({
						label: "Failed to save preferences",
						error,
					});
				});
		}
	}
/>

{#if isAndroidPlatform()}
	<Item.Root variant="outline" class="flex flex-col items-stretch gap-2 p-3">
		<Item.Content class="min-w-0">
			<Item.Title class="text-sm font-semibold"
				>Android Background Reliability</Item.Title
			>
			<Item.Description class="text-xs text-muted-foreground">
				Ensure Android does not put Open to sleep when running in
				background.
			</Item.Description>
		</Item.Content>
		<div class="flex flex-wrap gap-2 pt-1">
			<Button
				variant="outline"
				size="sm"
				onclick={requestIgnoreBatteryOptimizations}
			>
				Battery optimization: Unrestricted
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={openNotificationSettings}
			>
				Notification settings
			</Button>
			<Button
				variant="secondary"
				size="sm"
				onclick={testLocalNotification}
			>
				Test device notification
			</Button>
		</div>
	</Item.Root>
{:else}
	<div class="px-4 py-1">
		<Button variant="secondary" size="sm" onclick={testLocalNotification}>
			Test device notification
		</Button>
	</div>
{/if}

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
			<label
				for="ntfy-server"
				class="text-xs font-medium text-muted-foreground"
			>
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
						void setPreferences({
							ntfyServer: target.value || "https://ntfy.sh",
						});
					}
				}}
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label
				for="ntfy-topic"
				class="text-xs font-medium text-muted-foreground"
			>
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
				{testingNtfy ? "Sending..." : "Send test ntfy push"}
			</Button>
		</div>
	</Item.Root>
{/if}
