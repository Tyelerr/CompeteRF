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
    console.log("  - Is Appropriate:", result.isAppropriate);
    console.log("  - Violations:", result.violations);
    console.log("  - Confidence Levels:");
    console.log("    * Adult:", result.confidence.adult);
    console.log("    * Violence:", result.confidence.violence);
    console.log("    * Racy:", result.confidence.racy);
    console.log("    * Medical:", result.confidence.medical);
    console.log("    * Spoof:", result.confidence.spoof);

    if (result.isAppropriate) {
      console.log("🎉 SUCCESS: Image scanner is working correctly!");
    } else {
      console.log("⚠️  WARNING: Test image was flagged");
    }
  } catch (error) {
    console.error("❌ ERROR: Image scanner test failed");
    console.error("Error details:", error);
  }
};

// Run the test
testImageScanner();
