import { contextBridge, ipcRenderer } from "electron"
const { shell } = require("electron")
import fs from "fs"
import path from "path"
import { app } from "@electron/remote"

const logFile = path.join(app.getPath("userData"), "preload.log")

function log(message: string): void {
  const timestamp = new Date().toISOString()
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`)
}

// At the start of the file, after imports
log('Preload script starting')
log(`Process type: ${process.type}`)
log(`Node version: ${process.versions.node}`)
log(`Chrome version: ${process.versions.chrome}`)
log(`Electron version: ${process.versions.electron}`)

const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  API_KEY_OUT_OF_CREDITS: "processing-api-key-out-of-credits",

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

try {
  log('Setting up IPC handlers')
  
  // Types for the exposed Electron API
  interface ElectronAPI {
    updateContentDimensions: (dimensions: {
      width: number
      height: number
    }) => Promise<void>
    getScreenshots: () => Promise<{
      success: boolean
      previews?: Array<{ path: string; preview: string }> | null
      error?: string
    }>
    deleteScreenshot: (
      path: string
    ) => Promise<{ success: boolean; error?: string }>
    onScreenshotTaken: (
      callback: (data: { path: string; preview: string }) => void
    ) => () => void
    onSolutionsReady: (callback: (solutions: string) => void) => () => void
    onResetView: (callback: () => void) => () => void
    onSolutionStart: (callback: () => void) => () => void
    onDebugStart: (callback: () => void) => () => void
    onDebugSuccess: (callback: (data: any) => void) => () => void
    onSolutionError: (callback: (error: string) => void) => () => void
    onProcessingNoScreenshots: (callback: () => void) => () => void
    onProblemExtracted: (callback: (data: any) => void) => () => void
    onSolutionSuccess: (callback: (data: any) => void) => () => void

    onUnauthorized: (callback: () => void) => () => void
    onDebugError: (callback: (error: string) => void) => () => void
    takeScreenshot: () => Promise<void>
    moveWindowLeft: () => Promise<void>
    moveWindowRight: () => Promise<void>
    updateApiKey: (apiKey: string) => Promise<void>
    setApiKey: (apiKey: string) => Promise<{ success: boolean }>
    openExternal: (url: string) => void
  }

  // Before exposing the API
  log('Preparing to expose electronAPI')

  // Expose the Electron API to the renderer process with logging
  contextBridge.exposeInMainWorld("electronAPI", {
    updateContentDimensions: (dimensions: { width: number; height: number }) => {
      log(`updateContentDimensions called with: ${JSON.stringify(dimensions)}`)
      return ipcRenderer.invoke("update-content-dimensions", dimensions)
    },
    takeScreenshot: () => {
      log("takeScreenshot invoked from renderer")
      return ipcRenderer.invoke("take-screenshot")
    },
    getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
    deleteScreenshot: (path: string) =>
      ipcRenderer.invoke("delete-screenshot", path),

      // Event listeners
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => {
        const subscription = (_: any, data: { path: string; preview: string }) =>
          callback(data)
        ipcRenderer.on("screenshot-taken", subscription)
        return () => {
          ipcRenderer.removeListener("screenshot-taken", subscription)
        }
      },
      onSolutionsReady: (callback: (solutions: string) => void) => {
        const subscription = (_: any, solutions: string) => callback(solutions)
        ipcRenderer.on("solutions-ready", subscription)
        return () => {
          ipcRenderer.removeListener("solutions-ready", subscription)
        }
      },
      onResetView: (callback: () => void) => {
        const subscription = () => callback()
        ipcRenderer.on("reset-view", subscription)
        return () => {
          ipcRenderer.removeListener("reset-view", subscription)
        }
      },
      onSolutionStart: (callback: () => void) => {
        const subscription = () => callback()
        ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
        return () => {
          ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
        }
      },
      onDebugStart: (callback: () => void) => {
        const subscription = () => callback()
        ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
        return () => {
          ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
        }
      },

      onDebugSuccess: (callback: (data: any) => void) => {
        ipcRenderer.on("debug-success", (_event, data) => callback(data))
        return () => {
          ipcRenderer.removeListener("debug-success", (_event, data) =>
            callback(data)
          )
        }
      },
      onDebugError: (callback: (error: string) => void) => {
        const subscription = (_: any, error: string) => callback(error)
        ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
        return () => {
          ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
        }
      },
      onSolutionError: (callback: (error: string) => void) => {
        const subscription = (_: any, error: string) => callback(error)
        ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
        return () => {
          ipcRenderer.removeListener(
            PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            subscription
          )
        }
      },
      onProcessingNoScreenshots: (callback: () => void) => {
        const subscription = () => callback()
        ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
        return () => {
          ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
        }
      },

      onProblemExtracted: (callback: (data: any) => void) => {
        const subscription = (_: any, data: any) => callback(data)
        ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
        return () => {
          ipcRenderer.removeListener(
            PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            subscription
          )
        }
      },
      onSolutionSuccess: (callback: (data: any) => void) => {
        const subscription = (_: any, data: any) => callback(data)
        ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
        return () => {
          ipcRenderer.removeListener(
            PROCESSING_EVENTS.SOLUTION_SUCCESS,
            subscription
          )
        }
      },
      onUnauthorized: (callback: () => void) => {
        const subscription = () => callback()
        ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
        return () => {
          ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
        }
      },
      onApiKeyOutOfCredits: (callback: () => void) => {
        const subscription = () => callback()
        ipcRenderer.on(PROCESSING_EVENTS.API_KEY_OUT_OF_CREDITS, subscription)
        return () => {
          ipcRenderer.removeListener(
            PROCESSING_EVENTS.API_KEY_OUT_OF_CREDITS,
            subscription
          )
        }
      },
      moveWindowLeft: () => {
        log("moveWindowLeft invoked from renderer")
        return ipcRenderer.invoke("move-window-left")
      },
      moveWindowRight: () => {
        log("moveWindowRight invoked from renderer")
        return ipcRenderer.invoke("move-window-right")
      },
      updateApiKey: (apiKey: string) =>
        ipcRenderer.invoke("update-api-key", apiKey),
      setApiKey: (apiKey: string) => {
        log('setApiKey called with length: ' + apiKey.length)
        return ipcRenderer.invoke("set-api-key", apiKey)
      },
      openExternal: (url: string) => shell.openExternal(url)
    } as ElectronAPI)

    log('electronAPI exposed successfully')
} catch (error) {
  log(`Error in preload script: ${error}. Stack: ${error.stack}`)
}

// Add this focus restoration handler with logging
ipcRenderer.on("restore-focus", () => {
  log("restore-focus event received")
  // Try to focus the active element if it exists
  const activeElement = document.activeElement as HTMLElement
  if (activeElement && typeof activeElement.focus === "function") {
    activeElement.focus()
    log("Active element focused")
  } else {
    log("No active element to focus")
  }
})

// Add this at the end of the file
process.on('uncaughtException', (error) => {
    log(`Uncaught exception in preload: ${error}. Stack: ${error.stack}`)
})

process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection in preload: ${reason}`)
})

// Add IPC logging
ipcRenderer.on('update-content-dimensions-response', (event, response) => {
  log(`Received update-content-dimensions response: ${JSON.stringify(response)}`)
})
