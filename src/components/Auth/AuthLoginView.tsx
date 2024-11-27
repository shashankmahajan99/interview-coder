import { AuthService } from "../../lib/auth"

export const LoginView = () => {
  const handleLogin = async () => {
    const auth = AuthService.getInstance()
    try {
      await auth.signInWithGoogle()
    } catch (error) {
      console.error("Login failed:", error)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-black/60 backdrop-blur-md">
      <button
        onClick={handleLogin}
        className="bg-white text-black px-4 py-2 rounded-lg hover:bg-white/90"
      >
        Sign in with Google
      </button>
    </div>
  )
}
