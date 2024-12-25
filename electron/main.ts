import { app, BrowserWindow, globalShortcut } from "electron"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { autoUpdater } from "electron-updater"
import { initAutoUpdater } from "./autoUpdater"
import fs from "fs"
import path from "path"
import { initialize, enable } from '@electron/remote/main'

initialize()

async function initializeLogging() {
  try {
    const userDataPath = app.getPath("userData")
    const logPath = path.join(userDataPath, "logs")
    
    // Ensure the logs directory exists
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true })
    }
    
    // Test write permissions
    const testFile = path.join(logPath, "test.txt")
    fs.writeFileSync(testFile, "test")
    fs.unlinkSync(testFile)
    
    return path.join(logPath, "app.log")
  } catch (error) {
    console.error('Failed to initialize logging:', error)
    // Fallback to temp directory if userData is not accessible
    const tempPath = path.join(app.getPath("temp"), "app-logs")
    fs.mkdirSync(tempPath, { recursive: true })
    return path.join(tempPath, "app.log")
  }
}

// Define the log function
function log(message: string): void {
  try {
    const timestamp = new Date().toISOString()
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`)
  } catch (error) {
    console.error('Failed to write to log file:', error)
  }
}

let logFile: string; // Declare logFile at module scope

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper

  // View management
  private view: "queue" | "solutions" = "queue"
  private mode: "screenshot" | "text" = "screenshot"
  private textQuery: string = ""

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    API_KEY_OUT_OF_CREDITS: "processing-api-key-out-of-credits",
    NO_QUERY: "processing-no-query",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }

   public getMode(): "screenshot" | "text" {
    return this.mode
  }

  public setMode(mode: "screenshot" | "text"): void {
    this.mode = mode
  }

  public getTextQuery(): string {
    return this.textQuery
  }

  public setTextQuery(query: string): void {
    this.textQuery = query
  }

  public toggleMode(): void {
    this.mode = this.mode === "screenshot" ? "text" : "screenshot"
  }
}

// Application initialization
async function initializeApp() {
    try {
        logFile = await initializeLogging()
        log("Logging initialized")
        log(`App version: ${app.getVersion()}`)
        log(`App path: ${app.getAppPath()}`)
        log(`User data path: ${app.getPath('userData')}`)
        log(`Executable path: ${app.getPath('exe')}`)
        log(`Current working directory: ${process.cwd()}`)
        
        const appState = AppState.getInstance()
        log("AppState instance created")
        
        log("Initializing IPC handlers")
        initializeIpcHandlers(appState)
        
        app.whenReady().then(() => {
            log("App is ready")
            log(`Platform: ${process.platform}`)
            log(`__dirname: ${__dirname}`)
            log(`Environment: isPackaged=${app.isPackaged}, isDev=${process.env.NODE_ENV === "development"}`)
            
            try {
                log("Creating main window...")
                appState.createWindow()
                log("Window creation initiated")
                
                // Register global shortcuts using ShortcutsHelper
                log("Registering global shortcuts...")
                appState.shortcutsHelper.registerGlobalShortcuts()
                log("Global shortcuts registered successfully")
                
                // Initialize auto-updater in production
                if (app.isPackaged) {
                    log("Initializing auto-updater")
                    initAutoUpdater()
                } else {
                    log("Running in development mode - auto-updater disabled")
                }

                enable(appState.getMainWindow().webContents)
            } catch (error) {
                log(`Error in app.whenReady handler: ${error}. Stack: ${error.stack}`)
                console.error("Error in app.whenReady handler:", error)
            }
        })

        app.on("activate", () => {
            log("App activated")
            if (appState.getMainWindow() === null) {
                log("No main window found, creating new one")
                appState.createWindow()
                log("Main window recreated on activate")
            } else {
                log("Main window already exists")
            }
        })

        app.on("window-all-closed", () => {
            log("All windows closed event triggered")
            if (process.platform !== "darwin") {
                log("Platform is not macOS, quitting app")
                app.quit()
            }
        })

        app.on("will-quit", () => {
            log("App will quit - cleaning up...")
        })

        if (process.platform === "darwin") {
            log("Hiding dock icon on macOS")
            app.dock?.hide()
        }
        
        app.commandLine.appendSwitch("disable-background-timer-throttling")
        log("Background timer throttling disabled")
        
        log("Application initialization complete")
    } catch (error) {
        log(`Error in initializeApp: ${error}. Stack: ${error.stack}`)
        console.error("Error in initializeApp:", error)
    }
}

// Start the application
initializeApp().catch(console.error)
