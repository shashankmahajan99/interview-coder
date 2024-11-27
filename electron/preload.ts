import { contextBridge, ipcRenderer } from "electron"

const path = require("path")

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentHeight: (
    height: number
  ) => Promise<{ success: boolean; error?: string }>

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
  onProcessingStart: (callback: () => void) => () => void
  onProcessingSuccess: (callback: (data: any) => void) => () => void
  onProcessingExtraSuccess: (callback: (data: any) => void) => () => void
  onProcessingError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onInitialSolutionGenerated: (callback: (data: any) => void) => () => void

  onUnauthorized: (callback: () => void) => () => void
  takeScreenshot: () => Promise<void>
  openAuthWindow: (url: string) => Promise<void>
  storeSession: (session: any) => Promise<void>
  getSession: () => Promise<any>
  clearSession: () => Promise<void>
}

const PROCESSING_EVENTS = {
  START: "processing-start",
  SUCCESS: "processing-success",
  ERROR: "processing-error",
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  EXTRA_SUCCESS: "extra-processing-success",
  PROBLEM_EXTRACTED: "problem-extracted",
  INITIAL_SOLUTION_GENERATED: "initial-solution-generated"
} as const

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  storeSession: (session: any) => ipcRenderer.invoke("store-session", session),
  getSession: () => ipcRenderer.invoke("get-session"),
  clearSession: () => ipcRenderer.invoke("clear-session"),

  onAuthCallback: (callback: (url: string) => void) => {
    ipcRenderer.on("auth-callback", (_, url) => callback(url))
  },
  updateContentHeight: (height: number) =>
    ipcRenderer.invoke("update-content-height", height),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
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
  onProcessingStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.START, subscription)
    }
  },
  onProcessingSuccess: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.SUCCESS, subscription)
    }
  },
  onProcessingExtraSuccess: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.EXTRA_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.EXTRA_SUCCESS, subscription)
    }
  },
  onProcessingError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.ERROR, subscription)
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },
  // And in the implementation:
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
  onInitialSolutionGenerated: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_GENERATED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_GENERATED,
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
  openAuthWindow: (url: string) => ipcRenderer.invoke("open-auth-window", url)
} as ElectronAPI)
