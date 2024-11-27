import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { QueryClient, QueryClientProvider } from "react-query"
import { supabase } from "./lib/supabase"
import { AuthProvider } from "./components/Auth/AuthProvider"

declare global {
  interface Window {
    /**
     *  IMPORTANT:
     *  These are all API's that are either listeners for stuff that happens in the main process
     *
     *  OR
     *
     *  These are functions that directly manipulate what goes on in the main process
     *
     */
    electronAPI: {
      // METHODS THAT ARE ACTUALLY RUN IN THE MAIN PROCESS
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
      deleteScreenshot: (
        path: string
      ) => Promise<{ success: boolean; error?: string }>
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      updateContentHeight: (height: number) => Promise<void>

      //EVENT LISTENERS
      onProcessingStart: (callback: () => void) => () => void
      onProcessingSuccess: (callback: (data: any) => void) => () => void
      onProcessingExtraSuccess: (callback: (data: any) => void) => () => void
      onProcessingError: (callback: (error: string) => void) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void // this is command + r btw
      onUnauthorized: (callback: () => void) => () => void
      onInitialSolutionGenerated: (callback: (data: any) => void) => () => void
      onProblemExtracted: (callback: (data: any) => void) => () => void
      openAuthWindow: (url: string) => Promise<void>

      //random auth functions
      storeSession: (session: any) => Promise<void>
      getSession: () => Promise<any>
      clearSession: () => Promise<void>
    }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  }
})

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions">("queue")
  const containerRef = useRef<HTMLDivElement>(null)

  //use effect for dynamically changing height
  useEffect(() => {
    if (!containerRef.current) return

    const updateHeight = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight
      window.electronAPI?.updateContentHeight(height)
    }

    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })

    // Initial height update
    updateHeight()

    // Observe for changes
    resizeObserver.observe(containerRef.current)

    // Also update height when view changes
    const mutationObserver = new MutationObserver(() => {
      updateHeight()
    })

    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [view]) // Re-run when view changes

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onProcessingStart(() => {
        setView("solutions")
        console.log("starting processing")
      }),
      // clear  all the queeries
      window.electronAPI.onResetView(() => {
        console.log("Received 'reset-view' message from main process")
        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        queryClient.removeQueries(["thoughts"])
        queryClient.removeQueries(["time_complexity"])
        queryClient.removeQueries(["space_complexity"])
        setView("queue")
        console.log("View reset to 'queue' via Command+R shortcut")
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        //we'll always update the problem statement if we get the onproblemextracted thing
        queryClient.invalidateQueries(["problem_statement"])
        queryClient.setQueryData(["problem_statement"], data)
      }),

      window.electronAPI.onInitialSolutionGenerated((data: any) => {
        //if we get the notification that initial solution is generated, we'll always update the solution
        //this is fine; initial solution generated will only ping once per problem
        try {
          // Extract solution data from the response
          const { solution } = data
          const { code, thoughts, time_complexity, space_complexity } = solution

          // Store in React Query
          queryClient.setQueryData(["solution"], code)
          queryClient.setQueryData(["thoughts"], thoughts)
          queryClient.setQueryData(["time_complexity"], time_complexity)
          queryClient.setQueryData(["space_complexity"], space_complexity)
        } catch (error) {
          console.error("Error handling solution data:", error)
        }
      }),
      window.electronAPI.onProcessingExtraSuccess((data) => {
        const { solution } = data
        const { code, thoughts, time_complexity, space_complexity } = solution

        queryClient.setQueryData(["solution"], code)
        queryClient.setQueryData(["thoughts"], thoughts)
        queryClient.setQueryData(["time_complexity"], time_complexity)
        queryClient.setQueryData(["space_complexity"], space_complexity)
      }),
      window.electronAPI.onUnauthorized(async () => {
        // This is similar to your reset logic
        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        queryClient.removeQueries(["thoughts"])
        queryClient.removeQueries(["time_complexity"])
        queryClient.removeQueries(["space_complexity"])
        await supabase.auth.signOut() //if ever unauthorized, clear cache and signout.
        setView("queue")
      })
    ]
    return () => cleanupFunctions.forEach((cleanup) => cleanup())
  }, [])

  return (
    <div
      ref={containerRef}
      className="min-h-0 overflow-hidden "
      style={{ width: "600px" }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <div className="p-4">
              {view === "queue" ? <Queue setView={setView} /> : <Solutions />}
            </div>
            <ToastViewport />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </div>
  )
}

export default App
