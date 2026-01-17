import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/auth-buttons";

export default async function SignInPage() {
  const session = await auth();

  // If already signed in, redirect to home
  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
              GitCron
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Schedule GitHub Actions workflows with ease
            </p>
          </div>

          <div className="w-full rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2 text-center">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                  Sign in to continue
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Connect your GitHub account to schedule workflow runs
                </p>
              </div>

              <SignInButton />

              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                We&apos;ll request access to your repositories and workflows to
                enable scheduling.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
