import { redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth-buttons";

export default async function Home() {
  const session = await auth();

  // Redirect to sign-in if not authenticated
  if (!session) {
    redirect("/signin");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
            GitCron
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User avatar"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {session.user?.name}
              </span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                Welcome, {session.user?.name?.split(" ")[0]}!
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                Schedule GitHub Actions workflows to run at specific times.
              </p>
            </div>

            {/* Placeholder for scheduled workflows */}
            <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <svg
                    className="h-6 w-6 text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium text-zinc-900 dark:text-white">
                    No scheduled workflows
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    Create your first scheduled workflow to get started.
                  </p>
                </div>
                <button className="mt-2 flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">
                  Schedule a workflow
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
