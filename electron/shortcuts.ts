import { globalShortcut, app } from "electron"
import { AppState } from "./main" // Adjust the import path if necessary
import fs from "fs"
import path from "path"

const logFile = path.join(app.getPath("userData"), "app.log")

function log(message: string): void {
  const timestamp = new Date().toISOString()
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`)
}

export class ShortcutsHelper {
  private appState: AppState

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    log("Registering global shortcuts")
    
    globalShortcut.register("CommandOrControl+H", async () => {
      log('Shortcut "CommandOrControl+H" triggered')
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        console.log("Taking screenshot...")
        try {
          const screenshotPath = await this.appState.takeScreenshot()
          const preview = await this.appState.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        } 
      }
    })

    globalShortcut.register("CommandOrControl+Enter", async () => {
      log('Shortcut "CommandOrControl+Enter" triggered')
      const mode = this.appState.getMode()
      
      if (mode === "text") {
        const query = this.appState.getTextQuery()
        if (!query.trim()) {
          const mainWindow = this.appState.getMainWindow()
          if (mainWindow) {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.NO_QUERY
            )
          }
          return
        }
      }
      
      await this.appState.processingHelper.processQuery()
    })

    globalShortcut.register("CommandOrControl+R", () => {
      log('Shortcut "CommandOrControl+R" triggered')
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.appState.processingHelper.cancelOngoingRequests()

      // Clear both screenshot queues
      this.appState.clearQueues()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.appState.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    // New shortcuts for moving the window
    globalShortcut.register("CommandOrControl+Left", () => {
      log('Shortcut "CommandOrControl+Left" triggered')
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.appState.moveWindowLeft()
    })

    globalShortcut.register("CommandOrControl+Right", () => {
      log('Shortcut "CommandOrControl+Right" triggered')
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.appState.moveWindowRight()
    })
    globalShortcut.register("CommandOrControl+Down", () => {
      log('Shortcut "CommandOrControl+Down" triggered')
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.appState.moveWindowDown()
    })
    globalShortcut.register("CommandOrControl+Up", () => {
      log('Shortcut "CommandOrControl+Up" triggered')
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.appState.moveWindowUp()
    })

    globalShortcut.register("CommandOrControl+B", () => {
      log('Shortcut "CommandOrControl+B" triggered')
      this.appState.toggleMainWindow()
      // If window exists and we're showing it, bring it to front
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !this.appState.isVisible()) {
        // Force the window to the front on macOS
        if (process.platform === "darwin") {
          mainWindow.setAlwaysOnTop(true, "normal")
          // Reset alwaysOnTop after a brief delay
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(true, "floating")
            }
          }, 100)
        }
      }
    })

    globalShortcut.register("CommandOrControl+Shift+T", () => {
      log('Shortcut "CommandOrControl+Shift+T" triggered')
      this.appState.toggleMode()
      
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("mode-changed", this.appState.getMode())
      }
    })

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      log("Unregistering all global shortcuts")
      globalShortcut.unregisterAll()
    })

    log("Global shortcuts registration complete")
  }
}
