import { redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth-buttons";
import { HomeContent } from "@/components/home-content";

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

            <HomeContent />
          </div>
        </div>
      </main>
    </div>
  );
}
