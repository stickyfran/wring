import { toast } from "svelte-sonner";

import { getProfile } from "$lib/api/users/profiles";
import {
	bodyTypes,
	ethnicities,
	healthPractices,
	hivStatuses,
	lookingFor as lookingForLabels,
	meetAt as meetAtLabels,
	relationshipStatuses,
	sexualPositions,
	tribes,
	vaccines as vaccineLabels,
	type Profile,
} from "$lib/model/users/profiles";
import { downloadMediaUrl, saveTextFile } from "$lib/util/download";
import { profileMediaUrl } from "$lib/util/media";

export async function exportProfileData({
	profileId,
	existingProfile,
	additionalMediaUrls = [],
}: {
	profileId: number;
	existingProfile?: Partial<Profile> | null;
	additionalMediaUrls?: { url: string; filename: string }[];
}): Promise<void> {
	const toastId = `export-profile-${profileId}`;
	toast.loading(`Exporting data for profile #${profileId}...`, { id: toastId });

	let profile: Partial<Profile> | null = existingProfile ?? null;

	try {
		const fetched = await getProfile(profileId);
		profile = { ...existingProfile, ...fetched };
	} catch (e) {
		console.warn("Could not fetch latest profile from server, using cached profile info", e);
	}

	const subDir = String(profileId);
	const lines: string[] = [];

	lines.push("========================================");
	lines.push(`OPEN - PROFILE EXPORT #${profileId}`);
	lines.push("========================================");
	lines.push(`Export Date: ${new Date().toLocaleString()} (${new Date().toISOString()})`);
	lines.push(`Profile ID: ${profileId}`);
	lines.push(`Display Name: ${profile?.displayName || "None"}`);
	if (profile?.age) lines.push(`Age: ${profile.age}`);
	if (profile?.aboutMe) {
		lines.push(`\n--- ABOUT ME ---\n${profile.aboutMe.trim()}`);
	}

	lines.push("\n--- PHYSICAL & PERSONAL DETAILS ---");
	if (profile?.height) {
		const heightCm = Math.round(profile.height);
		const totalInches = Math.round(heightCm / 2.54);
		const feet = Math.floor(totalInches / 12);
		const inches = totalInches % 12;
		lines.push(`Height: ${heightCm} cm (${feet}'${inches}")`);
	}
	if (profile?.weight) {
		const weightKg = (profile.weight / 1000).toFixed(1);
		const weightLbs = Math.round((profile.weight / 1000) * 2.20462);
		lines.push(`Weight: ${weightKg} kg (${weightLbs} lbs)`);
	}
	if (profile?.bodyType && bodyTypes[profile.bodyType]) {
		lines.push(`Body Type: ${bodyTypes[profile.bodyType]}`);
	}
	if (profile?.ethnicity && ethnicities[profile.ethnicity]) {
		lines.push(`Ethnicity: ${ethnicities[profile.ethnicity]}`);
	}
	if (profile?.relationshipStatus && relationshipStatuses[profile.relationshipStatus]) {
		lines.push(`Relationship Status: ${relationshipStatuses[profile.relationshipStatus]}`);
	}
	if (profile?.sexualPosition && sexualPositions[profile.sexualPosition]) {
		lines.push(`Position: ${sexualPositions[profile.sexualPosition]}`);
	}
	if (profile?.lookingFor && profile.lookingFor.length > 0) {
		lines.push(`Looking For: ${profile.lookingFor.map((id) => lookingForLabels[id] || id).join(", ")}`);
	}
	if (profile?.grindrTribes && profile.grindrTribes.length > 0) {
		lines.push(`Tribes: ${profile.grindrTribes.map((id) => tribes[id] || id).join(", ")}`);
	}
	if (profile?.meetAt && profile.meetAt.length > 0) {
		lines.push(`Meet At: ${profile.meetAt.map((id) => meetAtLabels[id] || id).join(", ")}`);
	}

	lines.push("\n--- LOCATION & DISTANCE ---");
	if (profile?.distance !== undefined && profile.distance !== null) {
		const distM = Math.round(profile.distance);
		const distKm = (distM / 1000).toFixed(2);
		const distMiles = (distM / 1609.34).toFixed(2);
		lines.push(`Distance: ~${distM}m (${distKm} km / ${distMiles} mi)`);
		if (profile.approximateDistance) {
			lines.push("Distance is approximate: Yes");
		}
	}
	if (profile?.travelPlans && profile.travelPlans.length > 0) {
		lines.push("Travel Plans:");
		for (const tp of profile.travelPlans) {
			lines.push(`  - Location: ${tp.locationName} (Geohash: ${tp.geohash})`);
		}
	}

	lines.push("\n--- SOCIAL NETWORKS & CONTACTS ---");
	if (profile?.socialNetworks?.instagram?.userId) {
		lines.push(`Instagram: @${profile.socialNetworks.instagram.userId} (https://instagram.com/${profile.socialNetworks.instagram.userId})`);
	}
	if (profile?.verifiedInstagramId) {
		lines.push(`Verified Instagram: @${profile.verifiedInstagramId}`);
	}
	if (profile?.socialNetworks?.twitter?.userId) {
		lines.push(`Twitter / X: @${profile.socialNetworks.twitter.userId} (https://x.com/${profile.socialNetworks.twitter.userId})`);
	}
	if (profile?.socialNetworks?.facebook?.userId) {
		lines.push(`Facebook: ${profile.socialNetworks.facebook.userId}`);
	}

	lines.push("\n--- HEALTH & PRACTICES ---");
	if (profile?.hivStatus && hivStatuses[profile.hivStatus]) {
		lines.push(`HIV Status: ${hivStatuses[profile.hivStatus]}`);
	}
	if (profile?.lastTestedDate) {
		lines.push(`Last Tested: ${new Date(profile.lastTestedDate).toLocaleDateString()}`);
	}
	if (profile?.sexualHealth && profile.sexualHealth.length > 0) {
		lines.push(`Practices: ${profile.sexualHealth.map((id) => healthPractices[id] || id).join(", ")}`);
	}
	if (profile?.vaccines && profile.vaccines.length > 0) {
		lines.push(`Vaccines: ${profile.vaccines.map((id) => vaccineLabels[id] || id).join(", ")}`);
	}

	lines.push("\n========================================");

	const infoText = lines.join("\n");

	// Save profile info text file
	await saveTextFile(infoText, "profile_info.txt", subDir);

	// Collect and download all profile photos
	const mediaUrlsToDownload: { url: string; filename: string }[] = [];

	if (profile?.medias && profile.medias.length > 0) {
		profile.medias.forEach((m, idx) => {
			if (m.mediaHash) {
				const fullUrl = profileMediaUrl({ mediaHash: m.mediaHash, size: "full" });
				mediaUrlsToDownload.push({
					url: fullUrl,
					filename: `photo_${idx + 1}_${m.mediaHash}.jpg`,
				});
			}
		});
	} else if (profile?.profileImageMediaHash) {
		const fullUrl = profileMediaUrl({ mediaHash: profile.profileImageMediaHash, size: "full" });
		mediaUrlsToDownload.push({
			url: fullUrl,
			filename: `photo_1_${profile.profileImageMediaHash}.jpg`,
		});
	}

	if (profile?.rightNowFullImageUrl) {
		mediaUrlsToDownload.push({
			url: profile.rightNowFullImageUrl,
			filename: `right_now_${Date.now()}.jpg`,
		});
	}

	// Add any additional media (e.g. from chat or albums)
	for (const extra of additionalMediaUrls) {
		mediaUrlsToDownload.push(extra);
	}

	// Download each media into the user's subfolder
	let downloadedCount = 0;
	for (const item of mediaUrlsToDownload) {
		const ok = await downloadMediaUrl(item.url, item.filename, subDir, true);
		if (ok) downloadedCount++;
	}

	toast.success(
		`Exported profile #${profileId}: info.txt & ${downloadedCount} media file(s) saved to Open/${profileId}`,
		{ id: toastId, duration: 6000 },
	);
}
