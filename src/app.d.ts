import type { NativeInsets } from "$lib/platform/android-native-bridge";

declare global {
	namespace App {
		interface PageState {
			profileOrigin?: "browse";
		}
	}

	interface Window {
		__reapplyInsets: (insets?: NativeInsets) => unknown;
		__AndroidInsets?: {
			top(): number;
			bottom(): number;
			left(): number;
			right(): number;
			imeVisible?(): boolean;
		};
		__AndroidOnBackGesture?: () => boolean;
		__AndroidOnBackGestureStart?: () => boolean;
		__AndroidOnBackGestureCancel?: () => void;
		__AndroidBack?: { moveTaskToBack(): void; gestureProgress(): number };
		pswp?: unknown;
		__AndroidNotification?: {
			showNotification(
				id: number,
				title: string,
				body: string,
				conversationId: string,
			): void;
			requestPermission(): void;
			syncCredentials?(token: string, profileId: number): void;
			clearCredentials?(): void;
			startBackgroundService?(): void;
			stopBackgroundService?(): void;
			requestIgnoreBatteryOptimizations?(): void;
			openNotificationSettings?(): void;
		};
		__AndroidDownload?: {
			download(url: string, filename?: string): void;
			downloadToSubdir?(
				url: string,
				filename?: string,
				subDir?: string,
			): void;
			saveTextFileToSubdir?(
				content: string,
				filename: string,
				subDir?: string,
			): void;
			saveBase64ToSubdir?(
				base64Data: string,
				filename: string,
				subDir?: string,
				mimeType?: string,
			): boolean;
		};
	}
}

export {};
