'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function PlayerShell({ children, title, backHref = '/library' }: { children: React.ReactNode; title?: string; backHref?: string }) {
  return <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6"><header className="mb-4 flex min-h-10 items-center gap-3"><Link href={backHref} className="flex size-10 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#151515] hover:text-white" aria-label="Back"><ArrowLeft className="size-5" /></Link>{title && <h1 className="truncate text-sm font-semibold text-white">{title}</h1>}</header>{children}</main>
}
