// test-image-scanner.ts
import { ImageContentScanner } from "./image-scanner";

const testImageScanner = async () => {
  console.log("🧪 Testing Google Vision API Image Scanner...");

  try {
    // Test with a known safe image (Google's sample image)
    const testImageUrl =
      "https://storage.googleapis.com/cloud-samples-data/vision/using_curl/shanghai.jpeg";

    console.log("📡 Scanning image:", testImageUrl);

    const result = await ImageContentScanner.scanImage(testImageUrl);

    console.log("✅ Scan Results:");
    console.log("  - Status:", result.status);
    console.log("  - Is Appropriate:", result.isAppropriate);
    console.log("  - Reason:", result.reason ?? "(none)");
    console.log("  - SafeSearch:");
    console.log("    * Adult:", result.safeSearch?.adult);
    console.log("    * Violence:", result.safeSearch?.violence);
    console.log("    * Racy:", result.safeSearch?.racy);
    console.log("    * Medical:", result.safeSearch?.medical);
    console.log("    * Spoof:", result.safeSearch?.spoof);

    if (result.status === "approved") {
      console.log("🎉 SUCCESS: Image scanner is working correctly!");
    } else if (result.status === "rejected") {
      console.log("⚠️  Test image was flagged as inappropriate.");
    } else {
      // Note: scan-image has verify_jwt=true, so a standalone run without a signed-in
      // user session will return status:"error" (401). Run the real flow on-device.
      console.log("❌ Scanner returned an error:", result.reason);
    }
  } catch (error) {
    console.error("❌ ERROR: Image scanner test failed");
    console.error("Error details:", error);
  }
};

// Run the test
testImageScanner();
