<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import {
		syncBackgroundServiceState,
		syncSessionCredentials,
	} from "$lib/platform/notifications";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";
	import { retryBrokenMediaWhenOnline } from "$lib/util/media-retry-signals";

	let { data, children }: import("./$types").LayoutProps = $props();

	$effect(() => startOnlineHeartbeat());
	$effect(() => {
		void syncSessionCredentials();
		syncBackgroundServiceState();
	});
	$effect(() => retryBrokenMediaWhenOnline());
</script>

{@render children()}
<CommandCenter />
