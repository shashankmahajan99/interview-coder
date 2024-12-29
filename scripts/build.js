require("dotenv").config()
const { execSync } = require("child_process")

try {
 
  // Add platform check
  if (process.platform !== "darwin") {
    console.warn("Warning: Building for macOS on a non-macOS platform may fail")
  }

  // Run the build command with notarization settings
  execSync(
    "npm run clean && cross-env NODE_ENV=production tsc && vite build && electron-builder --win",
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: "true", 
        NOTARIZE: "true"
      }
    }
  )
} catch (error) {
  console.error("Build failed:", error)
  process.exit(1)
}
