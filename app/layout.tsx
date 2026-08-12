import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Bryan Transactions - Panel de Transacciones',
  description: 'Dashboard para monitorear transacciones bancarias en tiempo real',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0b0d',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
