import { app, BrowserWindow, screen, ipcMain, globalShortcut } from "electron"
import path from "node:path"
import fs from "node:fs"
import { v4 as uuidv4 } from "uuid"
import screenshot from "screenshot-desktop"
import FormData from "form-data"
import Store from "electron-store"
import { Session } from "@supabase/supabase-js"

import axios from "axios"

interface StoreSchema {
  session?: Session
}

class AppState {
  private static instance: AppState | null = null

  private store: Store<StoreSchema>

  // Window management
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = true
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null

  // View and queue management
  private view: "queue" | "solutions" = "queue"
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5
  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  }

  // Directory paths
  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string

  // Processing events
  private readonly PROCESSING_EVENTS = {
    START: "processing-start",
    SUCCESS: "processing-success",
    ERROR: "processing-error",
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    EXTRA_SUCCESS: "extra-processing-success",
    PROBLEM_EXTRACTED: "problem-extracted",
    INITIAL_SOLUTION_GENERATED: "initial-solution-generated"
  } as const

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  private constructor() {
    this.store = new Store<StoreSchema>()
    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir)
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir)
    }

    this.initializeIpcHandlers()
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  private getScreenHeight(): number {
    const primaryDisplay = screen.getPrimaryDisplay()
    return primaryDisplay.workAreaSize.height
  }

  // Window management methods
  public createWindow(): void {
    if (this.mainWindow !== null) return

    const screenHeight = this.getScreenHeight()
    const windowSettings = {
      width: 600,
      height: screenHeight,
      x: 0,
      y: 0,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js")
      },
      show: true,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      fullscreenable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      focusable: true
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setAlwaysOnTop(true, "floating")
    }

    this.mainWindow.webContents.openDevTools()
    const isDev = process.env.NODE_ENV === "development"
    const startUrl = isDev
      ? "http://localhost:5173"
      : `file://${path.join(__dirname, "../dist/index.html")}`

    this.mainWindow.loadURL(startUrl).catch((err) => {
      console.error("Failed to load URL:", err)
    })
    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }

    this.setupWindowListeners()
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) return

    this.mainWindow.on("move", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowSize = { width: bounds.width, height: bounds.height }
      }
    })

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  // Window visibility methods
  public hideMainWindow(): void {
    if (!this.mainWindow) {
      this.createWindow()
      return
    }

    if (this.mainWindow.isDestroyed()) {
      this.createWindow()
      return
    }

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.mainWindow.hide()
    this.isWindowVisible = false
  }

  public showMainWindow(): void {
    if (!this.mainWindow) {
      this.createWindow()
      return
    }

    if (this.mainWindow.isDestroyed()) {
      this.createWindow()
      return
    }

    const focusedWindow = BrowserWindow.getFocusedWindow()

    if (this.windowPosition && this.windowSize) {
      this.mainWindow.setBounds({
        x: this.windowPosition.x,
        y: this.windowPosition.y,
        width: this.windowSize.width,
        height: this.windowSize.height
      })
    }

    this.mainWindow.showInactive()

    if (focusedWindow && !focusedWindow.isDestroyed()) {
      focusedWindow.focus()
    }

    this.isWindowVisible = true
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow()
    }
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.view = "queue"
  }

  // Screenshot management methods
  private async takeScreenshot(): Promise<string> {
    if (!this.mainWindow) throw new Error("No main window available")

    this.hideMainWindow()
    let screenshotPath = ""

    if (this.view === "queue") {
      screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`)
      await screenshot({ filename: screenshotPath })

      this.screenshotQueue.push(screenshotPath)
      if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
        const removedPath = this.screenshotQueue.shift()
        if (removedPath) {
          try {
            await fs.promises.unlink(removedPath)
          } catch (error) {
            console.error("Error removing old screenshot:", error)
          }
        }
      }
    } else {
      screenshotPath = path.join(this.extraScreenshotDir, `${uuidv4()}.png`)
      await screenshot({ filename: screenshotPath })

      this.extraScreenshotQueue.push(screenshotPath)
      if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
        const removedPath = this.extraScreenshotQueue.shift()
        if (removedPath) {
          try {
            await fs.promises.unlink(removedPath)
          } catch (error) {
            console.error("Error removing old screenshot:", error)
          }
        }
      }
    }

    this.showMainWindow()
    return screenshotPath
  }

  private async getImagePreview(filepath: string): Promise<string> {
    try {
      const data = await fs.promises.readFile(filepath)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error) {
      console.error("Error reading image:", error)
      throw error
    }
  }

  // Processing methods
  private async processScreenshots(): Promise<void> {
    if (!this.mainWindow) return

    if (this.view === "queue") {
      if (this.screenshotQueue.length === 0) {
        this.mainWindow.webContents.send(this.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      this.mainWindow.webContents.send(this.PROCESSING_EVENTS.START)
      this.view = "solutions" //set it to solutions as soon as it starts
      // Initialize AbortController
      this.currentProcessingAbortController = new AbortController()
      const { signal } = this.currentProcessingAbortController

      try {
        const screenshots = await Promise.all(
          this.screenshotQueue.map(async (path) => ({
            path,
            preview: await this.getImagePreview(path)
          }))
        )

        console.log("regular screenshots")
        screenshots.forEach((screenshot: any) => {
          console.log(screenshot.path)
        })

        const result = await this.processScreenshotsHelper(screenshots, signal)

        if (result.success) {
          console.log("Processing success:", result.data)
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.SUCCESS,
            result.data
          )
        } else {
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.ERROR,
            result.error
          )
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          console.log("Processing request canceled")
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.ERROR,
            "Processing was canceled by the user."
          )
        } else {
          console.error("Processing error:", error)
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.ERROR,
            error.message
          )
        }
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // Existing logic for 'solutions' view

      if (this.extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots to process")
        this.mainWindow.webContents.send(this.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }
      this.mainWindow.webContents.send(this.PROCESSING_EVENTS.START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const screenshots = await Promise.all(
          [...this.screenshotQueue, ...this.extraScreenshotQueue].map(
            async (path) => ({
              path,
              preview: await this.getImagePreview(path)
            })
          )
        )

        const result = await this.processExtraScreenshotsHelper(
          screenshots,
          signal
        )

        if (result.success) {
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.EXTRA_SUCCESS,
            result.data
          )
        } else {
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.ERROR,
            result.error
          )
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          console.log("Extra processing request canceled")
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          console.error("Processing error:", error)
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string }>,
    signal: AbortSignal
  ) {
    try {
      const formData = new FormData()

      screenshots.forEach((screenshot) => {
        formData.append("images", fs.createReadStream(screenshot.path))
      })

      try {
        // First API call - extract problem
        const problemResponse = await axios.post(
          "http://localhost:8000/extract_problem",
          formData,
          {
            headers: {
              ...formData.getHeaders()
            },
            timeout: 300000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            signal
          }
        )

        // Store problem info
        this.problemInfo = {
          problem_statement: problemResponse.data.problem_statement,
          input_format: problemResponse.data.input_format,
          output_format: problemResponse.data.output_format,
          constraints: problemResponse.data.constraints,
          test_cases: problemResponse.data.test_cases
        }

        // Send first success event
        if (this.mainWindow) {
          this.mainWindow.webContents.send(
            this.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            problemResponse.data
          )
        }

        // Second API call - generate solutions
        if (this.mainWindow) {
          const solutionsResult = await this.generateSolutionsHelper(signal) // Pass the signal here
          if (solutionsResult.success) {
            this.mainWindow.webContents.send(
              this.PROCESSING_EVENTS.INITIAL_SOLUTION_GENERATED,
              solutionsResult.data
            )
          } else {
            throw new Error(
              solutionsResult.error || "Failed to generate solutions"
            )
          }
        }

        return { success: true, data: problemResponse.data }
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (this.mainWindow) {
            this.mainWindow.webContents.send(
              this.PROCESSING_EVENTS.UNAUTHORIZED,
              "Authentication required"
            )
          }
          this.view = "queue"
          throw new Error("Authentication required")
        }
        throw error
      }
    } catch (error) {
      console.error("Processing error:", error)
      return { success: false, error: error.message }
    }
  }

  // Implement generateSolutionsHelper
  private async generateSolutionsHelper(signal?: AbortSignal) {
    try {
      if (!this.problemInfo) {
        throw new Error("No problem info available")
      }

      try {
        const response = await axios.post(
          "http://localhost:8000/generate_solutions",
          { problem_info: this.problemInfo },
          {
            timeout: 300000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            signal
          }
        )

        if (!response || !response.data) {
          throw new Error("No response data received")
        }

        return { success: true, data: response.data }
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (this.mainWindow) {
            this.mainWindow.webContents.send(
              this.PROCESSING_EVENTS.UNAUTHORIZED,
              "Authentication required"
            )
          }
          throw new Error("Authentication required")
        }
        throw error
      }
    } catch (error) {
      console.error("Solutions generation error:", error)
      return { success: false, error: error.message }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string }>,
    signal: AbortSignal // Added signal parameter
  ) {
    try {
      const formData = new FormData()

      // Add images first
      screenshots.forEach((screenshot) => {
        formData.append("images", fs.createReadStream(screenshot.path))
      })

      if (!this.problemInfo) {
        throw new Error("No problem info available")
      }

      // Add problem_info
      formData.append("problem_info", JSON.stringify(this.problemInfo))

      console.log(formData)
      try {
        const response = await axios.post(
          "http://localhost:8000/debug_solutions",
          formData,
          {
            headers: {
              ...formData.getHeaders()
            },
            timeout: 300000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            signal
          }
        )

        if (!response || !response.data) {
          throw new Error("No response data received")
        }

        return { success: true, data: response.data }
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (this.mainWindow) {
            this.mainWindow.webContents.send(
              this.PROCESSING_EVENTS.UNAUTHORIZED,
              "Authentication required"
            )
          }
          throw new Error("Authentication required")
        }
        throw error
      }
    } catch (error) {
      console.error("Processing error:", error)
      return { success: false, error: error.message }
    }
  }

  public async deleteScreenshot(path: string) {
    try {
      await fs.promises.unlink(path)
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== path
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== path
        )
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting file:", error)
      return { success: false, error: error.message }
    }
  }

  // IPC Handlers setup
  private initializeIpcHandlers(): void {
    ipcMain.handle("store-session", (_event, session: Session) => {
      this.store.set("session", session) // Save session in the store
    })
    // Retrieve session from electron-store
    ipcMain.handle("get-session", () => {
      return this.store.get("session") // Get the stored session
    })

    // Clear session in electron-store
    ipcMain.handle("clear-session", () => {
      this.store.delete("session") // Remove the session from the store
    })

    ipcMain.handle("update-content-height", async (event, height: number) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const [width] = this.mainWindow.getSize()
        this.mainWindow.setSize(width, Math.ceil(height))
      }
    })

    ipcMain.handle("delete-screenshot", async (event, path: string) => {
      return this.deleteScreenshot(path)
    })

    ipcMain.handle("take-screenshot", async () => {
      try {
        const screenshotPath = await this.takeScreenshot()
        const preview = await this.getImagePreview(screenshotPath)
        return { path: screenshotPath, preview }
      } catch (error) {
        console.error("Error taking screenshot:", error)
        throw error
      }
    })

    ipcMain.handle("get-screenshots", async () => {
      console.log({
        view: this.view
      })
      try {
        let previews = []
        if (this.view === "queue") {
          previews = await Promise.all(
            this.screenshotQueue.map(async (path) => ({
              path,
              preview: await this.getImagePreview(path)
            }))
          )
        } else {
          previews = await Promise.all(
            this.extraScreenshotQueue.map(async (path) => ({
              path,
              preview: await this.getImagePreview(path)
            }))
          )
        }
        previews.forEach((preview: any) => console.log(preview.path))
        return previews
      } catch (error) {
        console.error("Error getting screenshots:", error)
        throw error
      }
    })

    ipcMain.handle("toggle-window", async () => {
      this.toggleMainWindow()
    })

    ipcMain.handle("reset-queues", async () => {
      try {
        this.clearQueues()
        console.log("Screenshot queues have been cleared.")
        return { success: true }
      } catch (error: any) {
        console.error("Error resetting queues:", error)
        return { success: false, error: error.message }
      }
    })
    ipcMain.handle("open-auth-window", async (event, authUrl: string) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.loadURL(authUrl)

      return new Promise((resolve) => {
        // Watch for redirects
        authWindow.webContents.on("will-redirect", (event, url) => {
          if (url.includes("access_token")) {
            authWindow.close()
            resolve(true)
          }
        })

        // Also watch for hash changes (some OAuth flows use hash parameters)
        authWindow.webContents.on("did-navigate", (event, url) => {
          if (url.includes("access_token")) {
            authWindow.close()
            resolve(true)
          }
        })

        authWindow.on("closed", () => {
          resolve(true)
        })
      })
    })
  }

  // Method to cancel ongoing API requests
  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      console.log("Canceled ongoing processing request.")
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      console.log("Canceled ongoing extra processing request.")
      wasCancelled = true
    }

    if (wasCancelled && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(
        this.PROCESSING_EVENTS.ERROR,
        "Processing was canceled by the user."
      )
    }
  }

  // Global shortcuts setup
  public setupGlobalShortcuts(): void {
    globalShortcut.register("CommandOrControl+H", async () => {
      if (this.mainWindow) {
        console.log("Taking screenshot...")
        try {
          const screenshotPath = await this.takeScreenshot()
          const preview = await this.getImagePreview(screenshotPath)
          this.mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    })

    globalShortcut.register("CommandOrControl+Enter", async () => {
      await this.processScreenshots()
    })

    globalShortcut.register("CommandOrControl+R", () => {
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.cancelOngoingRequests()

      // Clear both screenshot queues
      this.clearQueues()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.view = "queue"

      // Notify renderer process to switch view to 'queue'
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("reset-view")
      }
    })

    globalShortcut.register("CommandOrControl+B", () => {
      this.toggleMainWindow()
      // If window exists and we're showing it, bring it to front
      if (this.mainWindow && !this.isWindowVisible) {
        // Force the window to the front on macOS
        if (process.platform === "darwin") {
          this.mainWindow.setAlwaysOnTop(true, "normal")
          // Reset alwaysOnTop after a brief delay
          setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.setAlwaysOnTop(true, "floating")
            }
          }, 100)
        }
      }
    })
  }
}

// Application initialization
async function initializeApp() {
  const appState = AppState.getInstance()

  app.whenReady().then(() => {
    appState.createWindow()

    appState.setupGlobalShortcuts()

    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient("myapp", process.execPath, [
          path.resolve(process.argv[1])
        ])
      }
    } else {
      app.setAsDefaultProtocolClient("myapp")
    }

    app.on("activate", () => {
      if (!appState.getMainWindow()) {
        appState.createWindow()
      } else if (!appState.isVisible()) {
        appState.toggleMainWindow()
      }
    })
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  // Unregister shortcuts when quitting
  app.on("will-quit", () => {
    globalShortcut.unregisterAll()
  })

  app.dock?.hide() // Hide dock icon (optional)
  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

// Start the application
initializeApp().catch(console.error)
