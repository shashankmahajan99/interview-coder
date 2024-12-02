// ProcessingHelper.ts

import fs from "node:fs"
import FormData from "form-data"
import axios from "axios"
import { ScreenshotHelper } from "./ScreenshotHelper" // Adjust the import path if necessary
import { AppState } from "./main" // Adjust the import path if necessary
import dotenv from "dotenv"

dotenv.config()

console.log({ NODE_ENV: process.env.NODE_ENV })
const isDev = process.env.NODE_ENV === "development"

const baseUrl = isDev
  ? "http://localhost:8000"
  : "https://web-production-b2eb.up.railway.app"

console.log({ baseUrl })
const isDevTest = process.env.IS_DEV_TEST === "true"

const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500 // in milliseconds

console.log({ isDev, isDevTest, MOCK_API_WAIT_TIME })

export class ProcessingHelper {
  private appState: AppState
  private screenshotHelper: ScreenshotHelper

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(appState: AppState) {
    this.appState = appState
    this.screenshotHelper = appState.getScreenshotHelper()
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    const view = this.appState.getView()

    if (view === "queue") {
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS
        )
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")

      // Initialize AbortController
      this.currentProcessingAbortController = new AbortController()
      const { signal } = this.currentProcessingAbortController

      try {
        const screenshots = await Promise.all(
          screenshotQueue.map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path)
          }))
        )

        console.log("Regular screenshots")
        screenshots.forEach((screenshot: any) => {
          console.log(screenshot.path)
        })

        const result = await this.processScreenshotsHelper(screenshots, signal)

        if (result.success) {
          console.log("Processing success:", result.data)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          console.log("Processing request canceled")
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          console.error("Processing error:", error)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message
          )
        }
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      //view == solutions
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      if (extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots to process")
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS
        )
        return
      }
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const screenshots = await Promise.all(
          [
            ...this.screenshotHelper.getScreenshotQueue(),
            ...extraScreenshotQueue
          ].map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path)
          }))
        )

        const result = await this.processExtraScreenshotsHelper(
          screenshots,
          signal
        )

        if (result.success) {
          this.appState.setHasDebugged(true)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          console.log("Extra processing request canceled")
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          console.error("Processing error:", error)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
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
        let problemResponse

        if (!isDevTest) {
          // First API call - extract problem
          problemResponse = await axios.post(
            `${baseUrl}/extract_problem_temp`,
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
        } else {
          // Simulate API delay
          console.log(
            `Simulating extract_problem API delay of ${MOCK_API_WAIT_TIME}ms`
          )
          await new Promise((resolve) =>
            setTimeout(resolve, MOCK_API_WAIT_TIME)
          )

          // Use constants matching the expected output format
          problemResponse = {
            data: {
              problem_statement: "Sample problem statement",
              input_format: {
                description: "Sample input description",
                parameters: [
                  {
                    name: "n",
                    type: "number",
                    subtype: "integer"
                  },
                  {
                    name: "arr",
                    type: "array",
                    subtype: "integer"
                  }
                ]
              },
              output_format: {
                description: "Sample output description",
                type: "number",
                subtype: "integer"
              },
              constraints: [
                {
                  description: "1 ≤ n ≤ 1000",
                  parameter: "n",
                  range: {
                    min: 1,
                    max: 1000
                  }
                }
              ],
              test_cases: [
                {
                  input: {
                    args: [5, [1, 2, 3, 4, 5]]
                  },
                  output: {
                    result: 15
                  }
                }
              ]
            }
          }
        }

        // Store problem info in AppState
        this.appState.setProblemInfo({
          problem_statement: problemResponse.data.problem_statement,
          input_format: problemResponse.data.input_format,
          output_format: problemResponse.data.output_format,
          constraints: problemResponse.data.constraints,
          test_cases: problemResponse.data.test_cases
        })

        // Send first success event
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            problemResponse.data
          )
        }

        // Second API call - generate solutions
        if (mainWindow) {
          const solutionsResult = await this.generateSolutionsHelper(signal)
          if (solutionsResult.success) {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
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
        const mainWindow = this.appState.getMainWindow()
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (mainWindow) {
            //RESET FUNCTIONALITY

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

            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.UNAUTHORIZED,
              "Authentication required"
            )
          }
          this.appState.setView("queue")
          throw new Error("Authentication required")
        }
        throw error
      }
    } catch (error) {
      console.error("Processing error:", error)
      return { success: false, error: error.message }
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.appState.getProblemInfo()
      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      try {
        let response

        if (!isDevTest) {
          response = await axios.post(
            `${baseUrl}/generate_solutions_temp`,
            { problem_info: problemInfo },
            {
              timeout: 300000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              signal
            }
          )
        } else {
          // Simulate API delay
          console.log(
            `Simulating generate_solutions API delay of ${MOCK_API_WAIT_TIME}ms`
          )
          await new Promise((resolve) =>
            setTimeout(resolve, MOCK_API_WAIT_TIME)
          )
          response = {
            data: {
              solution: {
                thoughts: [
                  "First thought about the problem",
                  "Second thought about the problem"
                ],
                code: "// Sample code implementation\nfunction solve() { }",
                time_complexity:
                  "O(n) because we iterate through the array once",
                space_complexity: "O(1) because we use constant extra space"
              }
            }
          }
        }

        if (!response || !response.data) {
          throw new Error("No response data received")
        }

        console.log("Received response: ", response)

        return { success: true, data: response.data }
      } catch (error: any) {
        const mainWindow = this.appState.getMainWindow()
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (mainWindow) {
            //RESET FUNCTIONALITY

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

            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.UNAUTHORIZED,
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
    signal: AbortSignal
  ) {
    try {
      const formData = new FormData()

      // Add images first
      screenshots.forEach((screenshot) => {
        formData.append("images", fs.createReadStream(screenshot.path))
      })

      const problemInfo = this.appState.getProblemInfo()
      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      // Add problem_info
      formData.append("problem_info", JSON.stringify(problemInfo))

      try {
        let response

        if (!isDevTest) {
          response = await axios.post(
            `${baseUrl}/debug_solutions_temp`,
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
        } else {
          // Simulate API delay
          console.log(
            `Simulating debug_solutions API delay of ${MOCK_API_WAIT_TIME}ms`
          )
          await new Promise((resolve) =>
            setTimeout(resolve, MOCK_API_WAIT_TIME)
          )

          // Use constants matching the expected output format
          response = {
            data: {
              solution: {
                thoughts: [
                  "First thought about the problem",
                  "Second thought about the problem"
                ],
                old_code: "// Sample code implementation\nfunction solve() { }",
                new_code:
                  "// Sample code implementation\nfunction solve2() { }",
                time_complexity:
                  "O(n) because we iterate through the array once",
                space_complexity: "O(1) because we use constant extra space"
              }
            }
          }
        }

        if (!response || !response.data) {
          throw new Error("No response data received")
        }
        console.log({ debug_data: response.data })
        return { success: true, data: response.data }
      } catch (error: any) {
        const mainWindow = this.appState.getMainWindow()
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (mainWindow) {
            //RESET FUNCTIONALITY

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

            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.UNAUTHORIZED,
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

    // Reset hasDebugged flag
    this.appState.setHasDebugged(false)

    const mainWindow = this.appState.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("Processing was canceled by the user.")
    }
  }
}
