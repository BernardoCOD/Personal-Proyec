import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { RegistrarServiceWorker } from '@/componentes/registrar-sw'
import './globals.css'

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Nutri', template: '%s · Nutri' },
  description: 'Mi registro de comidas, macros, peso y actividad física.',
  applicationName: 'Nutri',
  appleWebApp: { capable: true, title: 'Nutri', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f4' },
    { media: '(prefers-color-scheme: dark)', color: '#110f19' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  )
}
