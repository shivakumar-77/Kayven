import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'Kayven',
  description: 'AI-powered fitness & nutrition',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Kayven' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/Kayven.PNG', sizes: '1254x1254', type: 'image/png' }],
    apple: [{ url: '/Kayven.PNG' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="Kayven"/>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
        <link rel="apple-touch-icon" href="/Kayven.PNG"/>
        <link rel="manifest" href="/manifest.json"/>
        {/* No-flash theme script */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var t=localStorage.getItem('Kayven_theme')||'auto';
  var d=document.documentElement;
  if(t==='dark')d.setAttribute('data-theme','dark');
  else if(t==='light')d.setAttribute('data-theme','light');
  else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)d.setAttribute('data-theme','dark');
})();`}}/>
        {/* Inject public env into window for client-side libs */}
        <script dangerouslySetInnerHTML={{ __html: `
window.__env = {
  NEXT_PUBLIC_SUPABASE_URL: "${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}"
};
`}}/>
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
        <Analytics />
        <script dangerouslySetInnerHTML={{ __html: `
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})
  })
}`}}/>
      </body>
    </html>
  )
}
