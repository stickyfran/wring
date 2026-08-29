const fs = require("fs");
const file = "src-tauri/gen/android/app/src/main/java/org/opengrind/MainActivity.kt";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
`	override fun onPause() {
		super.onPause()
		webViewRef?.resumeTimers()
	}`,
`	override fun onPause() {
		super.onPause()
		webViewRef?.onResume()
		webViewRef?.resumeTimers()
	}`
);

content = content.replace(
`	override fun onStop() {
		super.onStop()
		webViewRef?.resumeTimers()
	}`,
`	override fun onStop() {
		super.onStop()
		webViewRef?.onResume()
		webViewRef?.resumeTimers()
	}`
);

fs.writeFileSync(file, content);
