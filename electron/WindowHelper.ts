// electron/WindowHelper.ts

import { BrowserWindow, screen, app } from "electron"
import { AppState } from "main"
import path from "node:path"
import fs from "fs"

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
  ? "http://localhost:5173"
  : `file:///${path.join(__dirname, "../dist/index.html").replace(/\\/g, '/')}`

const logFile = path.join(app.getPath("userData"), "app.log")

function log(message: string): void {
  const timestamp = new Date().toISOString()
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`)
}

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null
  private appState: AppState

  // Initialize with explicit number type and 0 value
  private screenWidth: number = 0
  private screenHeight: number = 0
  private step: number = 0
  private currentX: number = 0
  private currentY: number = 0

  // Add this property to track focus
  private wasFocused: boolean = false

  constructor(appState: AppState) {
    this.appState = appState
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    log(`setWindowDimensions called with width: ${width}, height: ${height}`)
    
    // Get current window position
    const [currentX, currentY] = this.mainWindow.getPosition()
    log(`Current window position: x=${currentX}, y=${currentY}`)

    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    log(`Screen work area: ${JSON.stringify(workArea)}`)

    // Use 75% width if debugging has occurred, otherwise use 60%
    const maxAllowedWidth = Math.floor(
      workArea.width * (this.appState.getHasDebugged() ? 0.75 : 0.4)
    )
    log(`Max allowed width: ${maxAllowedWidth}`)

    // Ensure width doesn't exceed max allowed width and height is reasonable
    const newWidth = Math.min(width + 32, maxAllowedWidth)
    const newHeight = Math.max(Math.ceil(height), 100) // Ensure minimum height
    log(`Calculated dimensions - width: ${newWidth}, height: ${newHeight}`)

    // Center the window horizontally if it would go off screen
    const maxX = workArea.width - newWidth
    const newX = Math.min(Math.max(currentX, 0), maxX)

    const bounds = {
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight
    }
    log(`Setting window bounds: ${JSON.stringify(bounds)}`)
    
    this.mainWindow.setBounds(bounds)

    // Verify the bounds were set correctly
    const actualBounds = this.mainWindow.getBounds()
    log(`Actual window bounds after setting: ${JSON.stringify(actualBounds)}`)

    // Get content bounds for comparison
    const contentBounds = this.mainWindow.getContentBounds()
    log(`Content bounds: ${JSON.stringify(contentBounds)}`)

    // Update internal state
    this.windowPosition = { x: newX, y: currentY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
  }

  private enableDevTools(): void {
    if (!isDev && process.platform === "win32" && this.mainWindow) {
      this.mainWindow.webContents.openDevTools()
      this.logDebugInfo()
    }
  }
  
  private logDebugInfo(): void {
    console.log('Window Debug Info:', {
      platform: process.platform,
      dirname: __dirname,
      startUrl,
      windowExists: !!this.mainWindow,
      windowBounds: this.mainWindow?.getBounds(),
      isVisible: this.isWindowVisible,
      screenDimensions: {
        width: this.screenWidth,
        height: this.screenHeight
      },
      webContentsUrl: this.mainWindow?.webContents.getURL(),
      webContentsLoaded: this.mainWindow?.webContents.isLoadingMainFrame()
    })
  }
  

  public createWindow(): void {
    log("Creating main window")
    if (this.mainWindow !== null) {
        log("Main window already exists")
        return
    }

    log(`Platform: ${process.platform}, isDev: ${isDev}`)
    log(`startUrl: ${startUrl}`)
    log(`__dirname: ${__dirname}`)
    
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    log(`Screen dimensions: ${workArea.width}x${workArea.height}`)
    
    this.screenWidth = workArea.width
    this.screenHeight = workArea.height

    this.step = Math.floor(this.screenWidth / 10) // 10 steps
    this.currentX = 0 // Start at the left

    const windowSettings: Electron.BrowserWindowConstructorOptions = {
        height: 600,
        minWidth: 400, // Add minimum width
        minHeight: 300, // Add minimum height
        x: this.currentX,
        y: 0,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        },
        show: true,
        frame: false,
        transparent: process.platform === "darwin",
        fullscreenable: false,
        hasShadow: false,
        backgroundColor: process.platform === "darwin" ? "#00000000" : "#ffffff",
        focusable: true,
        alwaysOnTop: true,
        resizable: process.platform === "darwin" ? false : true // Only allow resizing on Windows
    }

    log(`Creating window with settings: ${JSON.stringify(windowSettings, null, 2)}`)
    log(`Preload script path: ${windowSettings.webPreferences?.preload}`)

    try {
        this.mainWindow = new BrowserWindow(windowSettings)
        log("BrowserWindow instance created successfully")

        // Add error listener for window creation
        this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            log(`Failed to load window content: ${errorDescription} (${errorCode})`)
        })

        // Add success listener
        this.mainWindow.webContents.on('did-finish-load', () => {
            log('Window content loaded successfully')
        })

        this.mainWindow.webContents.on('dom-ready', () => {
            log('DOM is ready')
        })

        this.mainWindow.webContents.on('crashed', (event) => {
            log('Window content crashed')
        })

        this.mainWindow.on('unresponsive', () => {
            log('Window became unresponsive')
        })

        log("Setting up window properties...")
        this.mainWindow.setContentProtection(true)
        
        if (process.platform === "darwin") {
            log("Configuring macOS-specific settings")
            this.mainWindow.setHiddenInMissionControl(true)
            this.mainWindow.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true
            })
            this.mainWindow.setAlwaysOnTop(true, "floating")
        } else if (process.platform === "win32") {
            log("Configuring Windows-specific settings")
            this.mainWindow.setAlwaysOnTop(true)
        }

        log("Attempting to load URL: " + startUrl)
        this.mainWindow.loadURL(startUrl).then(() => {
            log("URL loaded successfully")
            // Add immediate state check after load
            setTimeout(() => {
                log("Checking window state 100ms after load")
                this.logWindowState()
            }, 100)
            
            // Add another check after a longer delay
            setTimeout(() => {
                log("Checking window state 1000ms after load")
                this.logWindowState()
            }, 1000)
        }).catch((err) => {
            log(`Failed to load URL: ${err}. Stack: ${err.stack}`)
            console.error("Failed to load URL:", err, {
                platform: process.platform,
                startUrl,
                isDev
            })
        })

        const bounds = this.mainWindow.getBounds()
        log(`Initial window bounds: ${JSON.stringify(bounds)}`)
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.windowSize = { width: bounds.width, height: bounds.height }
        this.currentX = bounds.x
        this.currentY = bounds.y

        this.setupWindowListeners()
        this.isWindowVisible = true
        log("Main window setup complete and visible")

        this.mainWindow.webContents.on('did-start-loading', () => {
            log('WebContents started loading')
        })

        this.mainWindow.webContents.on('did-stop-loading', () => {
            log('WebContents stopped loading')
        })

        this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            log(`Failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}. isMainFrame: ${isMainFrame}`)
        })

        this.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            log(`Console ${level}: ${message} (${sourceId}:${line})`)
        })

        this.mainWindow.webContents.on('render-process-gone', (event, details) => {
            log(`Render process gone: ${JSON.stringify(details)}`)
        })

        // Enable remote debugging
        if (process.platform === 'win32') {
            this.mainWindow.webContents.openDevTools()
            log('DevTools opened for debugging')
        }

    } catch (error) {
        log(`Error creating window: ${error}. Stack: ${error.stack}`)
        console.error("Error creating window:", error)
    }
  }

  private logWindowState(): void {
    if (!this.mainWindow) return
    
    const contentBounds = this.mainWindow.getContentBounds()
    const normalBounds = this.mainWindow.getNormalBounds()
    const state = {
        isVisible: this.mainWindow.isVisible(),
        isMinimized: this.mainWindow.isMinimized(),
        isFocused: this.mainWindow.isFocused(),
        bounds: this.mainWindow.getBounds(),
        contentBounds,
        normalBounds,
        isDestroyed: this.mainWindow.isDestroyed(),
        isAlwaysOnTop: this.mainWindow.isAlwaysOnTop(),
        webContentsId: this.mainWindow.webContents.id,
        isWebContentsLoading: this.mainWindow.webContents.isLoading(),
        url: this.mainWindow.webContents.getURL()
    }
    
    log(`Window state: ${JSON.stringify(state, null, 2)}`)
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) {
      log("setupWindowListeners called but mainWindow is null")
      return
    }

    // Add visibility change listeners
    this.mainWindow.on("show", () => {
        log("Window show event triggered")
        this.logWindowState()
    })

    this.mainWindow.on("hide", () => {
        log("Window hide event triggered")
        this.logWindowState()
    })

    // Add focus listeners
    this.mainWindow.on("focus", () => {
        log("Window gained focus")
        this.logWindowState()
    })

    this.mainWindow.on("blur", () => {
        log("Window lost focus")
        this.logWindowState()
    })

    // Add visibility change listener to webContents
    this.mainWindow.webContents.on("did-become-hidden", () => {
        log("WebContents became hidden")
    })

    this.mainWindow.webContents.on("did-become-visible", () => {
        log("WebContents became visible")
    })

    // Add error listeners
    this.mainWindow.webContents.on("render-process-gone", (event, details) => {
        log(`Render process gone: ${JSON.stringify(details)}`)
    })

    this.mainWindow.webContents.on("unresponsive", () => {
        log("WebContents became unresponsive")
    })

    this.mainWindow.on("move", () => {
        if (this.mainWindow) {
            const bounds = this.mainWindow.getBounds()
            this.windowPosition = { x: bounds.x, y: bounds.y }
            this.currentX = bounds.x
            this.currentY = bounds.y
            log(`Window moved to x: ${bounds.x}, y: ${bounds.y}`)
            this.logWindowState()
        }
    })

    this.mainWindow.on("resize", () => {
        if (this.mainWindow) {
            const bounds = this.mainWindow.getBounds()
            this.windowSize = { width: bounds.width, height: bounds.height }
            log(`Window resized to width: ${bounds.width}, height: ${bounds.height}`)
        }
    })

    this.mainWindow.on("closed", () => {
        log("Main window closed")
        this.mainWindow = null
        this.isWindowVisible = false
        this.windowPosition = null
        this.windowSize = null
    })
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  public hideMainWindow(): void {
    log("hideMainWindow called")
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        log("Cannot hide window - window does not exist or is destroyed")
        return
    }

    this.logWindowState()
    
    // Store focus state before hiding
    this.wasFocused = this.mainWindow.isFocused()
    log(`Window was focused before hiding: ${this.wasFocused}`)

    const bounds = this.mainWindow.getBounds()
    log(`Storing window bounds before hiding: ${JSON.stringify(bounds)}`)
    
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    
    this.mainWindow.hide()
    log("Window hidden")
    
    this.isWindowVisible = false
    this.logWindowState()
  }

  public showMainWindow(): void {
    log("showMainWindow called")
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        log("Cannot show window - window does not exist or is destroyed")
        return
    }

    this.logWindowState()
    log("Attempting to show window...")

    const focusedWindow = BrowserWindow.getFocusedWindow()
    log(`Currently focused window ID: ${focusedWindow?.id}`)

    if (this.windowPosition && this.windowSize) {
        log(`Restoring window bounds: ${JSON.stringify({
            x: this.windowPosition.x,
            y: this.windowPosition.y,
            width: this.windowSize.width,
            height: this.windowSize.height
        })}`)
        
        this.mainWindow.setBounds({
            x: this.windowPosition.x,
            y: this.windowPosition.y,
            width: this.windowSize.width,
            height: this.windowSize.height
        })
    }

    this.mainWindow.showInactive()
    log("Window shown inactive")

    if (focusedWindow && !focusedWindow.isDestroyed()) {
        focusedWindow.focus()
        log("Restored focus to previously focused window")
    }

    this.isWindowVisible = true
    this.logWindowState()
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow()
    }
  }

  // New methods for window movement
  public moveWindowRight(): void {
    log("Moving window right")
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentX = Math.min(
      this.screenWidth - halfWidth,
      this.currentX + this.step
    )
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowLeft(): void {
    log("Moving window left")
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentX = Math.max(-halfWidth, this.currentX - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowDown(): void {
    log("Moving window down")
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0
    const halfHeight = windowHeight / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.min(
      this.screenHeight - halfHeight,
      this.currentY + this.step
    )
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowUp(): void {
    log("Moving window up")
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0
    const halfHeight = windowHeight / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.max(-halfHeight, this.currentY - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }
}
