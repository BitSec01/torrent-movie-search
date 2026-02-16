"use client";

import { useState } from "react";
import { SearchPage } from "@/components/search-page";
import { LibraryPage } from "@/components/library-page";
import { OrganizePage } from "@/components/organize-page";

type Tab = "search" | "library" | "organize";

const tabs: { id: Tab; label: string; color: string; icon: string }[] = [
  {
    id: "search",
    label: "Search",
    color: "bg-indigo-500",
    icon: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
  },
  {
    id: "library",
    label: "Library",
    color: "bg-emerald-500",
    icon: "M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776",
  },
  {
    id: "organize",
    label: "Organize",
    color: "bg-purple-500",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456z",
  },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <>
      {/* Top navigation bar */}
      <nav className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 sm:px-6 lg:px-8">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-3 text-sm font-medium transition ${
                tab === t.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                </svg>
                {t.label}
              </span>
              {tab === t.id && (
                <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.color}`} />
              )}
            </button>
          ))}
        </div>
      </nav>

      {tab === "search" && <SearchPage />}
      {tab === "library" && <LibraryPage />}
      {tab === "organize" && <OrganizePage />}
    </>
  );
}
